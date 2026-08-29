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
import type { ActivityType, FocusSessionDoc } from '../domain/types';
import { summarize } from '../data/summarize';
import type { StudySummary } from '../data/summarize';
import type { createFocusRepository } from '../data/focusRepository';
import type { createAchievementRepository } from '../../achievements/data/achievementRepository';
import type { createSkinSelectionRepository } from '../../skins/data/skinSelectionRepository';
import type {
  CompanionEventType,
  SkinManifest,
} from '../../skins/domain/types';
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

export interface FocusControllerDeps {
  repo: FocusRepository;
  achievementRepo: AchievementRepository;
  skinRepo: SkinSelectionRepository;
  manifest: SkinManifest;
  /** 已授予成就的 ruleKey（与仓储解耦，测试可直接桩定） */
  loadGranted: () => Promise<AchievementRuleKey[]>;
}

/** 完成页载荷：一次完成的会话 + 统计 + 本次新授予的成就 */
export interface CompletionView {
  session: FocusSessionDoc;
  todayMinutes: number;
  weekMinutes: number;
  grants: AchievementRuleKey[];
}

/** 单一活动横幅：eventType + 到期时刻（到期后由 tick/前台刷新清除） */
export interface BannerView {
  eventType: CompanionEventType;
  endsAt: number;
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
  skin: SkinManifest;
  selectedSkinId: string;
  companion: CompanionRuntimeState;
  banner: BannerView | null;
  cooldown: CooldownView | null;
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
  drink(now: number): void;
  complete(now: number): void;
  abandon(now: number): void;
  selectSkin(skinId: string): void;
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
  const { repo, achievementRepo, skinRepo, manifest } = deps;

  let state: FocusState = {
    hydrated: false,
    activeSession: null,
    remainingSeconds: 0,
    effectiveSeconds: 0,
    summary: summarize([], 0),
    skin: manifest,
    selectedSkinId: manifest.id,
    companion: initialState(manifest.defaultState),
    banner: null,
    cooldown: null,
    reducedMotion: false,
    newGrants: [],
    completions: null,
  };
  const listeners = new Set<() => void>();
  const pending = new Set<Promise<unknown>>();
  // 内存权威副本：磁盘为持久化投影；同步读保证状态转换无异步缝隙
  let history: FocusSessionDoc[] = [];
  let grantedKeys = new Set<AchievementRuleKey>();
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

  /** 执行效果：横幅取同批 autoReturn 的时长；冷却提示转成 until 时刻。
   *  swapPoster/autoReturn 无需存储——companion 状态本身已编码，UI 直接读。 */
  function transientsFrom(
    effects: readonly CompanionEffect[],
    now: number,
  ): Partial<FocusState> {
    let banner = state.banner;
    let cooldown = state.cooldown;
    for (const effect of effects) {
      if (effect.kind === 'showBanner') {
        // 单一活动横幅：每次 showBanner 直接取代上一条（expiry 由 afterMs 决定）
        const autoReturn = effects.find(
          (item): item is Extract<CompanionEffect, { kind: 'autoReturn' }> =>
            item.kind === 'autoReturn',
        );
        banner = {
          eventType: effect.eventType,
          endsAt: now + (autoReturn?.afterMs ?? 0),
        };
      } else if (effect.kind === 'cooldownNotice') {
        cooldown = {
          eventType: effect.eventType,
          until: now + effect.remainingSeconds * 1000,
        };
      }
    }
    return { banner, cooldown };
  }

  /** 派发陪伴事件（reducedMotion 显式传入，绝不依赖默认值）。 */
  function dispatchCompanion(eventType: CompanionEventType, now: number): void {
    const { next, effects } = dispatch(state.companion, eventType, {
      now,
      manifest,
      reducedMotion: state.reducedMotion,
    });
    commit({ companion: next, ...transientsFrom(effects, now) });
  }

  function expireTransients(now: number): Partial<FocusState> {
    const patch: Partial<FocusState> = {};
    if (state.banner && now >= state.banner.endsAt) patch.banner = null;
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

  /** 评估并授予新成就（recordGrant/recordRoomItem 幂等，写入异步跟进）。 */
  function grantNewlyEarned(sourceSessionId: string, now: number): AchievementRuleKey[] {
    const grants = evaluateGrants(completedSnapshots(), [...grantedKeys], now);
    for (const ruleKey of grants) {
      grantedKeys.add(ruleKey);
      const def = ACHIEVEMENT_DEFS.find((item) => item.ruleKey === ruleKey);
      if (!def) continue;
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
      return;
    }
    commit({
      activeSession: null,
      remainingSeconds: 0,
      effectiveSeconds: 0,
      ...(mount ? { companion: initialState(manifest.defaultState) } : {}),
    });
  }

  async function doRestore(now: number): Promise<void> {
    const [storedHistory, grantedList, selected, active] = await Promise.all([
      repo.loadHistory(),
      deps.loadGranted(),
      skinRepo.loadSelected(),
      repo.loadActive(),
    ]);
    history = storedHistory;
    grantedKeys = new Set(grantedList);
    commit({
      hydrated: true,
      skin: manifest,
      selectedSkinId: selected?.skinId ?? manifest.id,
      summary: summarize(history, now),
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
    commit({ activeSession: doc, remainingSeconds: input.plannedSeconds, effectiveSeconds: 0 });
    dispatchCompanion('focus.started', now);
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
    void track(repo.saveActive(paused)).catch(noop);
  }

  function resume(now: number): void {
    const doc = state.activeSession;
    if (!doc) return;
    const resumed = resumeSession(doc, now);
    if (resumed === doc) return;
    commit({ activeSession: resumed });
    dispatchCompanion('focus.resumed', now);
    void track(repo.saveActive(resumed)).catch(noop);
  }

  function drink(now: number): void {
    dispatchCompanion('wellness.drink', now);
  }

  function complete(now: number): void {
    const doc = state.activeSession;
    if (!doc) return;
    const completed = completeSession(doc, now);
    if (completed === doc) return;
    dispatchCompanion('focus.completed', now);
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
      banner: null,
      companion: initialState(manifest.defaultState),
    });
    void track(repo.appendHistory(abandoned)).catch(noop);
    void track(repo.clearActive()).catch(noop);
  }

  function selectSkin(skinId: string): void {
    // P0-A 仅内置雨夜书房：未知 id 直接忽略（防止选中无清单的皮肤）
    if (skinId !== manifest.id) return;
    commit({ selectedSkinId: skinId, skin: manifest });
    void track(skinRepo.select(skinId, Date.now())).catch(noop);
  }

  function tick(now: number): void {
    let patch: Partial<FocusState> = {};
    const doc = state.activeSession;
    if (doc && (doc.status === 'active' || doc.status === 'paused')) {
      patch.remainingSeconds = remainingSeconds(doc, now);
      patch.effectiveSeconds = effectiveSeconds(doc, now);
    }
    if (state.companion.playing) {
      // advance 未到点为空操作（同引用）；到点弹出队列/回归并产出效果
      const { next, effects } = advance(state.companion, now, manifest, state.reducedMotion);
      patch = { ...patch, companion: next, ...transientsFrom(effects, now) };
    }
    // 到期清理最后执行，以 patch 里的最新值为准（横幅可能刚被 showBanner 取代）
    const banner = patch.banner !== undefined ? patch.banner : state.banner;
    const cooldown = patch.cooldown !== undefined ? patch.cooldown : state.cooldown;
    if (banner && now >= banner.endsAt) patch.banner = null;
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
    drink,
    complete,
    abandon,
    selectSkin,
    tick,
    acknowledgeCompletions,
    setReducedMotion,
    flush,
  };
}
