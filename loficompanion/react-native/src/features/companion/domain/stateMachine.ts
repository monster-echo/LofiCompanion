import type {
  CompanionEventType,
  CompanionState,
  SkinManifest,
} from '../../skins/domain/types';
import { mappingFor } from '../../skins/domain/resolve';

/**
 * 陪伴状态机（doc-01 §5.4 事件驱动陪伴）。纯函数、`now` 一律入参——
 * 应用层持有 CompanionRuntimeState，把事件逐个 dispatch 进来，按 effects
 * 换海报/设定回归定时器。绝不 import 任何平台模块。
 *
 * 术语：`state` 永远指基态（ready/focusing/paused/resting/completed）；
 * `playing` 是正在展示的事件动作（如 drinking），播完（advance）后回到基态。
 */

/** 队列容量：播放中的动作打不断时最多缓存 3 条事件 */
export const MAX_QUEUE = 3;
/** 队列保鲜期：入队超过 10s 的事件在 advance 时按过期丢弃 */
export const QUEUE_TTL_MS = 10_000;
/** reduce motion 下动作展示时长（静态图一闪而过） */
export const REDUCED_MOTION_DURATION_MS = 1000;
/** 清单缺资产时的兜底展示时长（与内置静态海报一致） */
const DEFAULT_DURATION_MS = 4000;

/** 事件 → 动作展示状态（drinking/resting 等只出现在 playing，不属于基态机） */
const EVENT_STATE: Record<CompanionEventType, CompanionState> = {
  'session.ready': 'ready',
  'focus.started': 'focusing',
  'focus.loop': 'focusing',
  'wellness.drink': 'drinking',
  'focus.paused': 'paused',
  'break.started': 'resting',
  'focus.resumed': 'focusing',
  // doc-03 §6：focusing --> completed: focus.completed，完成海报即可见状态
  'focus.completed': 'completed',
};

/** 事件 → 基态转移（无条件立即生效，即使动作被打断/排队/丢弃） */
const BASE_TRANSITION: Partial<Record<CompanionEventType, CompanionState>> = {
  'session.ready': 'ready',
  'focus.started': 'focusing',
  'focus.paused': 'paused',
  'break.started': 'resting',
  'focus.resumed': 'focusing',
  // doc-03 §6：focus.completed → completed（终态）；completed --> ready 由
  // session.ready（= new.session）触发。wellness.drink / focus.loop 不改基态。
  'focus.completed': 'completed',
};

/** 终态事件：播完后不按 returnState 自动离开（completed 保持到 new.session）。 */
function isTerminalEvent(eventType: CompanionEventType): boolean {
  return eventType === 'focus.completed';
}

export interface QueuedEvent {
  eventType: CompanionEventType;
  queuedAt: number;
}

export interface PlayingAction {
  eventType: CompanionEventType;
  state: CompanionState;
  /** 动作开播时刻的基态快照：advance 据此判断播放期间基态是否被改写 */
  baseAtStart: CompanionState;
  startedAt: number;
  durationMs: number;
}

export interface CompanionRuntimeState {
  /** 基态：ready / focusing / paused / resting / completed */
  state: CompanionState;
  /** 正在展示的事件动作；null = 展示基态 */
  playing: PlayingAction | null;
  /** 各事件最近一次真正开播的时间戳（入队/冷却忽略不记录） */
  lastFiredAt: Partial<Record<CompanionEventType, number>>;
  /** 被打断动作挤下的事件队列，最多 MAX_QUEUE 条 */
  queue: QueuedEvent[];
}

export type CompanionEffect =
  | { kind: 'swapPoster'; state: CompanionState } // 派生：playing ? 事件态 : 基态
  | { kind: 'autoReturn'; afterMs: number }
  | { kind: 'cooldownNotice'; eventType: CompanionEventType; remainingSeconds: number };

export interface DispatchCtx {
  now: number;
  manifest: SkinManifest;
  reducedMotion: boolean;
}

/** 清单未声明的事件映射时兜底：零优先级、可打断、无冷却 */
function fallbackMapping(eventType: CompanionEventType) {
  return {
    eventType,
    priority: 0,
    interruptible: true,
    cooldownSeconds: 0,
    returnState: EVENT_STATE[eventType],
  };
}

function priorityOf(manifest: SkinManifest, eventType: CompanionEventType): number {
  return mappingFor(manifest, eventType)?.priority ?? 0;
}

function durationMsOf(
  manifest: SkinManifest,
  state: CompanionState,
  reducedMotion: boolean,
): number {
  if (reducedMotion) return REDUCED_MOTION_DURATION_MS;
  const asset = manifest.states.find((item) => item.state === state);
  return asset?.durationMs ?? DEFAULT_DURATION_MS;
}

/** 开始播放某事件动作：产出动作与配套效果（换海报 / 自动回归）。
 *  事件提醒由陪伴画面本身承担（海报/视频状态切换），不再产出文字横幅。 */
function startPlaying(
  manifest: SkinManifest,
  eventType: CompanionEventType,
  base: CompanionState,
  now: number,
  reducedMotion: boolean,
): { action: PlayingAction; effects: CompanionEffect[] } {
  const state = EVENT_STATE[eventType];
  const durationMs = durationMsOf(manifest, state, reducedMotion);
  return {
    action: { eventType, state, baseAtStart: base, startedAt: now, durationMs },
    effects: [
      { kind: 'swapPoster', state },
      { kind: 'autoReturn', afterMs: durationMs },
    ],
  };
}

export function initialState(base: CompanionState): CompanionRuntimeState {
  return { state: base, playing: null, lastFiredAt: {}, queue: [] };
}

/**
 * 派发一个事件。顺序：冷却判定 → 基态转移（无条件）→ 打断或入队。
 * 纯函数：不改 prev，返回全新状态。
 */
export function dispatch(
  prev: CompanionRuntimeState,
  eventType: CompanionEventType,
  ctx: DispatchCtx,
): { next: CompanionRuntimeState; effects: CompanionEffect[] } {
  const { now, manifest, reducedMotion } = ctx;
  const mapping = mappingFor(manifest, eventType) ?? fallbackMapping(eventType);

  // 1) 冷却：同类动作未过冷却 → 状态完全不变，只提示剩余秒数。
  //    （内置清单仅 wellness.drink 有 60s 冷却。）
  const lastFired = prev.lastFiredAt[eventType];
  const cooldownMs = mapping.cooldownSeconds * 1000;
  if (cooldownMs > 0 && lastFired !== undefined && now - lastFired < cooldownMs) {
    const effects: CompanionEffect[] = [
      {
        kind: 'cooldownNotice',
        eventType,
        remainingSeconds: Math.ceil((lastFired + cooldownMs - now) / 1000),
      },
    ];
    return { next: prev, effects };
  }

  // 2) 基态转移立即生效——即使动作被排队或丢弃。
  const base = BASE_TRANSITION[eventType] ?? prev.state;

  // 3) 打断判定：focus.completed 是终态事件，无论谁在播都直接打断；
  //    其余事件仅当「播放中的动作可打断 且 来事件优先级严格更高」时打断。
  let interrupt: boolean;
  if (prev.playing === null) {
    interrupt = true; // 空闲直接播
  } else if (eventType === 'focus.completed') {
    interrupt = true;
  } else {
    const playingMapping =
      mappingFor(manifest, prev.playing.eventType) ?? fallbackMapping(prev.playing.eventType);
    interrupt = playingMapping.interruptible && mapping.priority > playingMapping.priority;
  }

  if (interrupt) {
    const started = startPlaying(manifest, eventType, base, now, reducedMotion);
    return {
      next: {
        state: base,
        playing: started.action,
        lastFiredAt: { ...prev.lastFiredAt, [eventType]: now },
        queue: prev.queue,
      },
      effects: started.effects,
    };
  }

  // 4) 打不断：入队（未满直接追加；满员且来事件优先级高于队内最低时挤掉最低），否则丢弃。
  let queue = prev.queue;
  if (queue.length < MAX_QUEUE) {
    queue = [...queue, { eventType, queuedAt: now }];
  } else {
    let lowest = 0;
    for (let i = 1; i < queue.length; i++) {
      if (priorityOf(manifest, queue[i].eventType) < priorityOf(manifest, queue[lowest].eventType)) {
        lowest = i;
      }
    }
    if (mapping.priority > priorityOf(manifest, queue[lowest].eventType)) {
      queue = queue.filter((_, i) => i !== lowest).concat({ eventType, queuedAt: now });
    }
    // 否则：丢弃来事件（队列与播放均不变）
  }

  return { next: { ...prev, state: base, queue }, effects: [] };
}

/**
 * 播放推进：应用层在 playing.durationMs 到点（或定时器触发）时调用。
 * 未到时长为空操作；到点后弹出队列中未过期（≤10s）的最高优先级事件继续播，
 * 队列空/全过期则收尾回归。
 *
 * 回归目标：播放期间基态被改写（如喝水时按下暂停）→ 回当前基态；
 * 否则终态事件停在当前基态（completed 等待 new.session），其余事件回到
 * 清单声明的 returnState（未声明则回开播时的基态）。
 */
export function advance(
  prev: CompanionRuntimeState,
  now: number,
  manifest: SkinManifest,
  reducedMotion = false,
): { next: CompanionRuntimeState; effects: CompanionEffect[] } {
  const playing = prev.playing;
  if (playing === null || now - playing.startedAt < playing.durationMs) {
    return { next: prev, effects: [] };
  }

  const fresh = prev.queue.filter((queued) => now - queued.queuedAt <= QUEUE_TTL_MS);
  if (fresh.length > 0) {
    // 取最高优先级；同优先级取先入队者（stable）
    let best = 0;
    for (let i = 1; i < fresh.length; i++) {
      if (priorityOf(manifest, fresh[i].eventType) > priorityOf(manifest, fresh[best].eventType)) {
        best = i;
      }
    }
    const nextEvent = fresh[best];
    const started = startPlaying(manifest, nextEvent.eventType, prev.state, now, reducedMotion);
    return {
      next: {
        state: prev.state,
        playing: started.action,
        lastFiredAt: { ...prev.lastFiredAt, [nextEvent.eventType]: now },
        queue: fresh.filter((_, i) => i !== best),
      },
      effects: started.effects,
    };
  }

  // 队列空或全部过期：清掉过期项，收尾回归
  const baseChanged = prev.state !== playing.baseAtStart;
  const returnTo: CompanionState = baseChanged
    ? prev.state // 播放期间基态已变 → 以当前基态为准
    : isTerminalEvent(playing.eventType)
      ? prev.state // completed 持续到 new.session，不按 returnState 自动离开
      : (mappingFor(manifest, playing.eventType)?.returnState ?? playing.baseAtStart);
  return {
    next: { ...prev, state: returnTo, playing: null, queue: [] },
    effects: [{ kind: 'swapPoster', state: returnTo }],
  };
}
