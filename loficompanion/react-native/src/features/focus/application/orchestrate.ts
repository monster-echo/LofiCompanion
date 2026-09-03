import {
  abandonSession,
  completeSession,
  deriveOnLaunch,
  effectiveSeconds,
  pauseSession,
  remainingSeconds,
  resumeSession,
} from '../domain/engine';
import { validateSessionInput } from '../domain/validate';
import { telemetry } from '../../../telemetry/Telemetry';
import type { ActivityType, FocusSessionDoc } from '../domain/types';
import { summarize } from '../data/summarize';
import type { StudySummary } from '../data/summarize';
import type { createFocusRepository } from '../data/focusRepository';
import type { createAchievementRepository } from '../../achievements/data/achievementRepository';
import type { createSkinSelectionRepository } from '../../skins/data/skinSelectionRepository';
import type { FocusMusicEffects } from '../../music/domain/musicController';
import type {
  CompanionEventType,
  CompanionState,
  SkinManifest,
} from '../../skins/domain/types';
import { DEFAULT_SKIN_MANIFEST } from '../../skins/domain/registry';
import {
  advance,
  dispatch,
  initialState,
} from '../../companion/domain/stateMachine';
import type {
  CompanionEffect,
  CompanionRuntimeState,
} from '../../companion/domain/stateMachine';
import {
  ACHIEVEMENT_DEFS,
  evaluateGrants,
} from '../../achievements/domain/rules';
import type {
  AchievementRuleKey,
  CompletedSession,
  RoomItemId,
} from '../../achievements/domain/rules';

/**
 * 专注应用层编排（P0-A Task 7）。把计时域、陪伴状态机、成就规则与三个本地
 * 仓储接成一个可测的控制器：状态转换同步生效（UI 无闪烁），持久化与成就
 * 写入异步跟进（fire-and-forget，flush() 供测试收敛）。本模块绝不 import
 * react-native——平台接线（AppState/AccessibilityInfo/Context）全部在
 * FocusStore.tsx。
 *
 * 时钟纪律：动作方法全部 `now` 入参（屏幕传 Date.now()）；selectSkin 的
 * 持久化时间戳属于内部路径，直接用 Date.now()。所有域调用保持纯函数。
 */

type FocusRepository = ReturnType<typeof createFocusRepository>;
type AchievementRepository = ReturnType<typeof createAchievementRepository>;
type SkinSelectionRepository = ReturnType<typeof createSkinSelectionRepository>;

/** 已授予成就的最小快照（成就卡解锁时刻展示用；与仓储解耦的读取口径） */
export interface GrantRecord {
  ruleKey: AchievementRuleKey;
  grantedAtUtc: number;
}

/** 已解锁房间收藏物的最小快照（房间页热点定位用） */
export interface RoomItemSnapshot {
  itemId: RoomItemId;
  unlockedAtUtc: number;
}

export interface FocusControllerDeps {
  repo: FocusRepository;
  achievementRepo: AchievementRepository;
  skinRepo: SkinSelectionRepository;
  /** 内置皮肤注册表（[0] 为默认）；selectSkin/restore 只在其中解析 */
  manifests: readonly SkinManifest[];
  /** 动态清单源（P0-B：远端皮肤就位后的合并视图，含内置）；缺省用 manifests */
  getManifests?: () => readonly SkinManifest[];
  /** 已授予成就（含授予时刻；与仓储解耦，测试可直接桩定） */
  loadGranted: () => Promise<readonly GrantRecord[]>;
  /** 已解锁房间收藏物；缺省视为空（兼容未接线的旧调用方） */
  loadRoomItems?: () => Promise<readonly RoomItemSnapshot[]>;
  /** 健康事件随机排程用；测试注入确定性序列（缺省 Math.random） */
  rng?: () => number;
  /** 背景音乐效果（expo-audio 实现；缺省 no-op，测试可桩定录制调用） */
  music?: FocusMusicEffects;
}

/** 完成页载荷：一次完成的会话 + 统计 + 本次新授予的成就 */
export interface CompletionView {
  session: FocusSessionDoc;
  todayMinutes: number;
  weekMinutes: number;
  grants: AchievementRuleKey[];
}

/** 冷却提示：同类健康动作下次可用时刻 */
export interface CooldownView {
  eventType: CompanionEventType;
  until: number;
}

export interface FocusState {
  /** restore() 完成前 false（屏幕据此渲染加载态） */
  hydrated: boolean;
  activeSession: FocusSessionDoc | null;
  remainingSeconds: number;
  effectiveSeconds: number;
  summary: StudySummary;
  /** 全量本地历史（含 abandoned 审计文档；统计口径由读取方过滤 completed） */
  history: readonly FocusSessionDoc[];
  /** 已授予成就（成就卡解锁态/解锁时刻） */
  granted: readonly GrantRecord[];
  /** 已解锁房间收藏物（房间页热点） */
  roomItems: readonly RoomItemSnapshot[];
  skin: SkinManifest;
  selectedSkinId: string;
  companion: CompanionRuntimeState;
  cooldown: CooldownView | null;
  /** 下次自动喝水时刻（skin.yaml wellness.autoDrink 排程；无活动会话为 null） */
  nextAutoDrinkAt: number | null;
  reducedMotion: boolean;
  newGrants: AchievementRuleKey[];
  completions: CompletionView | null;
}

export type StartSessionResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'alreadyActive' };

export interface FocusController {
  getState(): FocusState;
  subscribe(listener: () => void): () => void;
  /** 挂载（冷启动）：载入历史/成就/皮肤选择 → deriveOnLaunch 强杀恢复 */
  restore(now: number): Promise<void>;
  /** 后台→前台：从磁盘重推导，绝不累加前台秒 */
  onForeground(now: number): Promise<void>;
  startSession(
    activity: ActivityType,
    minutes: number,
    now: number,
  ): StartSessionResult;
  pause(now: number): void;
  resume(now: number): void;
  complete(now: number): void;
  abandon(now: number): void;
  selectSkin(skinId: string): void;
  /** 远端皮肤目录到达后的重挂载：可解析上次选择时自动切回 */
  reattachSkinCatalog(): void;
  tick(now: number): void;
  acknowledgeCompletions(): void;
  setReducedMotion(reducedMotion: boolean): void;
  /** 等待全部在途持久化写入收敛（测试用） */
  flush(): Promise<void>;
}

/** 模块级单调序号：保证同进程内 id/clientRequestId 唯一。 */
let seq = 0;
function nextId(now: number, kind: 'session' | 'req'): string {
  seq += 1;
  return `${kind}-${now.toString(36)}-${seq.toString(36)}`;
}

function noop(): void {
  /* 持久化失败的静默兜底：P0-A 本地闭环，不阻塞 UI */
}

export function createFocusController(deps: FocusControllerDeps): FocusController {
  const { repo, achievementRepo, skinRepo, manifests } = deps;

  /** 生效清单：getManifests 注入时为内置+远端合并视图，否则仅静态内置 */
  function registry(): readonly SkinManifest[] {
    return deps.getManifests?.() ?? manifests;
  }

  /** 注册表内解析皮肤（先 id 后 slug）；未命中 undefined */
  function resolveManifest(idOrSlug: string): SkinManifest | undefined {
    const list = registry();
    return (
      list.find((skin) => skin.id === idOrSlug) ??
      list.find((skin) => skin.slug === idOrSlug)
    );
  }

  /** 当前生效清单：selectSkin/restore 切换后，所有域调用读这份可变引用 */
  let currentManifest: SkinManifest = registry()[0] ?? DEFAULT_SKIN_MANIFEST;

  /** 自动喝水排程：目标皮肤 wellness.autoDrink 区间内随机取下个触发点。 */
  function scheduleAutoDrink(target: SkinManifest, now: number): number | null {
    const auto = target.wellness?.autoDrink;
    if (!auto?.enabled) return null;
    const minMs = Math.max(0, auto.minIntervalMinutes) * 60_000;
    const maxMs = Math.max(minMs, auto.maxIntervalMinutes * 60_000);
    const roll = deps.rng ? deps.rng() : Math.random();
    return now + minMs + roll * (maxMs - minMs);
  }

  /** 自动喝水的最小间隔（resume 后钳制用）；未启用返回 null。 */
  function minAutoDrinkDelayMs(target: SkinManifest): number | null {
    const auto = target.wellness?.autoDrink;
    if (!auto?.enabled) return null;
    return Math.max(0, auto.minIntervalMinutes) * 60_000;
  }

  let state: FocusState = {
    hydrated: false,
    activeSession: null,
    remainingSeconds: 0,
    effectiveSeconds: 0,
    summary: summarize([], 0),
    history: [],
    granted: [],
    roomItems: [],
    skin: currentManifest,
    selectedSkinId: currentManifest.id,
    companion: initialState(currentManifest.defaultState),
    cooldown: null,
    nextAutoDrinkAt: null,
    reducedMotion: false,
    newGrants: [],
    completions: null,
  };
  const listeners = new Set<() => void>();
  const pending = new Set<Promise<unknown>>();
  // 内存权威副本：磁盘为持久化投影；同步读保证状态转换无异步缝隙
  let history: FocusSessionDoc[] = [];
  let grantedKeys = new Set<AchievementRuleKey>();
  let grantedRecords: readonly GrantRecord[] = [];
  let roomItemSnapshots: readonly RoomItemSnapshot[] = [];
  let restoreInFlight: Promise<void> | null = null;

  function commit(patch: Partial<FocusState>): void {
    let changed = false;
    for (const key of Object.keys(patch) as (keyof FocusState)[]) {
      if (state[key] !== patch[key]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  }

  function track<T>(operation: Promise<T>): Promise<T> {
    const settled = operation.then(noop, noop);
    pending.add(settled);
    void settled.then(() => pending.delete(settled));
    return operation;
  }

  /** 执行效果：冷却提示转成 until 时刻。swapPoster/autoReturn 无需存储——
   *  companion 状态本身已编码，UI 直接读（画面即提醒，不再有文字横幅）。 */
  function transientsFrom(
    effects: readonly CompanionEffect[],
    now: number,
  ): Partial<FocusState> {
    let cooldown = state.cooldown;
    for (const effect of effects) {
      if (effect.kind === 'cooldownNotice') {
        cooldown = {
          eventType: effect.eventType,
          until: now + effect.remainingSeconds * 1000,
        };
      }
    }
    return { cooldown };
  }

  /** 派发陪伴事件（reducedMotion 显式传入，绝不依赖默认值）。 */
  function dispatchCompanion(eventType: CompanionEventType, now: number): void {
    const { next, effects } = dispatch(state.companion, eventType, {
      now,
      manifest: currentManifest,
      reducedMotion: state.reducedMotion,
    });
    commit({ companion: next, ...transientsFrom(effects, now) });
  }

  function expireTransients(now: number): Partial<FocusState> {
    const patch: Partial<FocusState> = {};
    if (state.cooldown && now >= state.cooldown.until) patch.cooldown = null;
    return patch;
  }

  /** 成就域快照：仅 completed 会话（与 summarize/成就规则同一口径）。 */
  function completedSnapshots(): CompletedSession[] {
    return history
      .filter(
        (doc) => doc.status === 'completed' && typeof doc.completedAtUtc === 'number',
      )
      .map((doc) => ({
        activity: doc.activity,
        effectiveSeconds: effectiveSeconds(doc, doc.completedAtUtc as number),
        completedAtUtc: doc.completedAtUtc as number,
      }));
  }

  /** 评估并授予新成就（recordGrant/recordRoomItem 幂等，写入异步跟进）。
   *  内存快照同步追加，成就/房间两屏无需等待磁盘。 */
  function grantNewlyEarned(sourceSessionId: string, now: number): AchievementRuleKey[] {
    const grants = evaluateGrants(completedSnapshots(), [...grantedKeys], now);
    for (const ruleKey of grants) {
      grantedKeys.add(ruleKey);
      grantedRecords = [...grantedRecords, { ruleKey, grantedAtUtc: now }];
      const def = ACHIEVEMENT_DEFS.find((item) => item.ruleKey === ruleKey);
      if (!def) continue;
      if (!roomItemSnapshots.some((item) => item.itemId === def.rewardItemId)) {
        roomItemSnapshots = [
          ...roomItemSnapshots,
          { itemId: def.rewardItemId, unlockedAtUtc: now },
        ];
      }
      void track(achievementRepo.recordGrant(ruleKey, def, sourceSessionId, now)).catch(noop);
      void track(achievementRepo.recordRoomItem(def, now)).catch(noop);
    }
    return grants;
  }

  /** 完成结算：入历史（内存+磁盘）→ 授予 → 汇总 → completions 就绪。 */
  function settleCompletion(doc: FocusSessionDoc, now: number): void {
    history = [...history, doc];
    const grants = grantNewlyEarned(doc.id, now);
    const summary = summarize(history, now);
    commit({
      activeSession: null,
      remainingSeconds: remainingSeconds(doc, now),
      effectiveSeconds: effectiveSeconds(doc, now),
      summary,
      history,
      granted: grantedRecords,
      roomItems: roomItemSnapshots,
      nextAutoDrinkAt: null,
      newGrants: grants,
      completions: {
        session: doc,
        todayMinutes: summary.todayMinutes,
        weekMinutes: summary.weekMinutes,
        grants,
      },
    });
    void track(repo.appendHistory(doc)).catch(noop);
    void track(repo.clearActive()).catch(noop);
  }

  /** 活动位推导（挂载与前台共用）：completed → 自动完成结算；
   *  active/paused → 恢复；null → 清空（挂载时陪伴回默认基态）。 */
  function applyDerived(doc: FocusSessionDoc | null, now: number, mount: boolean): void {
    const derived = doc ? deriveOnLaunch(doc, now) : null;

    if (derived && derived.status === 'completed') {
      // 强杀期间越过计划终点：完成时刻取推导值（误差 ≤1s），绝不写 now
      commit({ companion: initialState('completed') });
      deps.music?.sessionEnded(); // 后台期间原生层还在播：返回前台即停
      settleCompletion(derived, now);
      return;
    }
    if (derived) {
      commit({
        activeSession: derived,
        remainingSeconds: remainingSeconds(derived, now),
        effectiveSeconds: effectiveSeconds(derived, now),
        ...(mount
          ? { companion: initialState(derived.status === 'paused' ? 'paused' : 'focusing') }
          : {}),
      });
      if (derived.status === 'active') {
        // 冷启动恢复/前台回归：原生音频层可能已随上次进程消亡，活跃会话
        // 恢复即对齐 lofi 播放（幂等——已在播则无损重对齐）。paused 会话
        // 保持无声，与 pause 语义一致，由 resume() 恢复。
        deps.music?.sessionStarted();
      }
      return;
    }
    commit({
      activeSession: null,
      remainingSeconds: 0,
      effectiveSeconds: 0,
      ...(mount ? { companion: initialState(currentManifest.defaultState) } : {}),
    });
  }

  async function doRestore(now: number): Promise<void> {
    const [storedHistory, grantedList, storedRoomItems, selected, active] = await Promise.all([
      repo.loadHistory(),
      deps.loadGranted(),
      deps.loadRoomItems?.() ?? [],
      skinRepo.loadSelected(),
      repo.loadActive(),
    ]);
    history = storedHistory;
    grantedKeys = new Set(grantedList.map((grant) => grant.ruleKey));
    grantedRecords = grantedList;
    roomItemSnapshots = storedRoomItems;
    // 存量选择 → 注册表解析；未知 id（过期/损坏数据）落回默认皮肤
    currentManifest =
      (selected ? resolveManifest(selected.skinId) : undefined) ??
      registry()[0] ??
      DEFAULT_SKIN_MANIFEST;
    commit({
      hydrated: true,
      skin: currentManifest,
      selectedSkinId: currentManifest.id,
      summary: summarize(history, now),
      history,
      granted: grantedRecords,
      roomItems: roomItemSnapshots,
    });
    applyDerived(active, now, true);
  }

  function restore(now: number): Promise<void> {
    if (restoreInFlight) return restoreInFlight;
    restoreInFlight = doRestore(now).finally(() => {
      restoreInFlight = null;
    });
    return restoreInFlight;
  }

  async function onForeground(now: number): Promise<void> {
    if (!state.hydrated) {
      await restore(now); // 冷启动首个 active 事件与挂载并发：去重，绝不双跑
      return;
    }
    const active = await repo.loadActive();
    applyDerived(active, now, false); // 非挂载：companion/completions 保持不动
    commit({ summary: summarize(history, now), ...expireTransients(now) });
  }

  function startSession(
    activity: ActivityType,
    minutes: number,
    now: number,
  ): StartSessionResult {
    if (state.activeSession) return { ok: false, reason: 'alreadyActive' };
    const input = validateSessionInput(activity, minutes);
    if (!input) return { ok: false, reason: 'invalid' };
    const doc: FocusSessionDoc = {
      id: nextId(now, 'session'),
      clientRequestId: nextId(now, 'req'),
      activity: input.activity,
      plannedSeconds: input.plannedSeconds,
      status: 'active',
      startedAtUtc: now,
      pauses: [],
      docVersion: 1,
    };
    commit({
      activeSession: doc,
      remainingSeconds: input.plannedSeconds,
      effectiveSeconds: 0,
      nextAutoDrinkAt: scheduleAutoDrink(currentManifest, now),
    });
    dispatchCompanion('focus.started', now);
    deps.music?.sessionStarted();
    // 专注漏斗起点（核心转化：开始→完成时长此前完全不可观测）
    telemetry.track('focus_session_start', {
      activity: doc.activity,
      planned_seconds: doc.plannedSeconds,
    });
    void track(repo.saveActive(doc)).catch(noop);
    return { ok: true };
  }

  function pause(now: number): void {
    const doc = state.activeSession;
    if (!doc) return;
    const paused = pauseSession(doc, now);
    if (paused === doc) return; // 幂等：已暂停/已结束
    commit({ activeSession: paused });
    dispatchCompanion('focus.paused', now);
    deps.music?.paused();
    telemetry.track('focus_session_pause', { activity: paused.activity });
    void track(repo.saveActive(paused)).catch(noop);
  }

  function resume(now: number): void {
    const doc = state.activeSession;
    if (!doc) return;
    const resumed = resumeSession(doc, now);
    if (resumed === doc) return;
    // 暂停期间不消耗喝水排程：恢复后至少再等一个最小间隔
    const minDelay = minAutoDrinkDelayMs(currentManifest);
    const nextAutoDrinkAt =
      minDelay !== null && state.nextAutoDrinkAt !== null
        ? Math.max(state.nextAutoDrinkAt, now + minDelay)
        : state.nextAutoDrinkAt;
    commit({ activeSession: resumed, nextAutoDrinkAt });
    dispatchCompanion('focus.resumed', now);
    deps.music?.resumed();
    telemetry.track('focus_session_resume', { activity: resumed.activity });
    void track(repo.saveActive(resumed)).catch(noop);
  }

  function complete(now: number): void {
    const doc = state.activeSession;
    if (!doc) return;
    const completed = completeSession(doc, now);
    if (completed === doc) return;
    dispatchCompanion('focus.completed', now);
    deps.music?.sessionEnded();
    telemetry.track('focus_session_complete', {
      activity: completed.activity,
      planned_seconds: completed.plannedSeconds,
      effective_seconds: effectiveSeconds(completed, now),
    });
    settleCompletion(completed, now);
  }

  function abandon(now: number): void {
    const doc = state.activeSession;
    if (!doc) return;
    const abandoned = abandonSession(doc, now);
    if (abandoned === doc) return;
    // 历史保留 abandoned 文档（审计/离线同步），但 summarize/成就口径只认
    // completed——不入统计、不评估授予；陪伴回默认基态（P0 事件表无 abandon 事件）
    history = [...history, abandoned];
    commit({
      activeSession: null,
      remainingSeconds: 0,
      effectiveSeconds: effectiveSeconds(abandoned, now),
      summary: summarize(history, now),
      history,
      nextAutoDrinkAt: null,
      companion: initialState(currentManifest.defaultState),
    });
    deps.music?.sessionEnded();
    telemetry.track('focus_session_abandon', {
      activity: abandoned.activity,
      planned_seconds: abandoned.plannedSeconds,
      effective_seconds: effectiveSeconds(abandoned, now),
    });
    void track(repo.appendHistory(abandoned)).catch(noop);
    void track(repo.clearActive()).catch(noop);
  }

  /** 远端目录就位后的重挂载（P2 皮肤云端化）：上次选择的皮肤现在可解析时切回
   *  （冷启动时远端未就绪暂落默认皮肤；目录到达由 FocusStore 调用本方法）。 */
  function reattachSkinCatalog(): void {
    const target = resolveManifest(state.selectedSkinId) ?? registry()[0];
    if (target && target.id !== currentManifest.id) selectSkin(target.id);
  }

  function selectSkin(skinId: string): void {
    // 注册表未命中的 id 直接忽略（防止选中无清单的皮肤）
    const target = resolveManifest(skinId);
    if (!target) return;
    // 同名状态原样带过（focusing 切肤仍是 focusing）；新清单缺该态则回其默认基态
    const mappedState: CompanionState = target.states.some(
      (asset) => asset.state === state.companion.state,
    )
      ? state.companion.state
      : target.defaultState;
    currentManifest = target;
    commit({
      selectedSkinId: target.id,
      skin: target,
      companion: initialState(mappedState),
      // 计时中切肤：按新主题排程重排（autoDrink 关闭则为 null）
      nextAutoDrinkAt: state.activeSession
        ? scheduleAutoDrink(target, Date.now())
        : null,
    });
    void track(skinRepo.select(target.id, Date.now())).catch(noop);
  }

  function tick(now: number): void {
    let patch: Partial<FocusState> = {};
    const doc = state.activeSession;
    if (doc && (doc.status === 'active' || doc.status === 'paused')) {
      patch.remainingSeconds = remainingSeconds(doc, now);
      patch.effectiveSeconds = effectiveSeconds(doc, now);
    }
    // 自动喝水（主题排程）：仅在活跃计时中触发，播完回归 focusing
    if (
      doc?.status === 'active' &&
      state.nextAutoDrinkAt !== null &&
      now >= state.nextAutoDrinkAt
    ) {
      dispatchCompanion('wellness.drink', now);
      patch.nextAutoDrinkAt = scheduleAutoDrink(currentManifest, now);
    }
    if (state.companion.playing) {
      // advance 未到点为空操作（同引用）；到点弹出队列/回归并产出效果
      const { next, effects } = advance(state.companion, now, currentManifest, state.reducedMotion);
      patch = { ...patch, companion: next, ...transientsFrom(effects, now) };
    }
    // 到期清理最后执行，以 patch 里的最新值为准
    const cooldown = patch.cooldown !== undefined ? patch.cooldown : state.cooldown;
    if (cooldown && now >= cooldown.until) patch.cooldown = null;
    commit(patch);
  }

  function acknowledgeCompletions(): void {
    commit({ completions: null, newGrants: [] });
  }

  function setReducedMotion(reducedMotion: boolean): void {
    commit({ reducedMotion });
  }

  async function flush(): Promise<void> {
    while (pending.size > 0) {
      await Promise.all([...pending]);
    }
  }

  return {
    getState: () => state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    restore,
    onForeground,
    startSession,
    pause,
    resume,
    complete,
    abandon,
    selectSkin,
    reattachSkinCatalog,
    tick,
    acknowledgeCompletions,
    setReducedMotion,
    flush,
  };
}
