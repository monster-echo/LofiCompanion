import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { rainyStudyRoomManifest } from '../../skins/domain/rainyStudyRoom';
import type {
  CompanionEventType,
  SkinManifest,
} from '../../skins/domain/types';
import type { CompanionRuntimeState } from '../../companion/domain/stateMachine';
import { createAchievementRepository } from '../../achievements/data/achievementRepository';
import { createSkinSelectionRepository } from '../../skins/data/skinSelectionRepository';
import type { AchievementRuleKey } from '../../achievements/domain/rules';
import { createFocusRepository } from '../data/focusRepository';
import type { StorageDriver } from '../data/storageDriver';
import type { ActivityType, FocusSessionDoc } from '../domain/types';
import {
  createFocusController,
  type CompletionView,
  type FocusController,
  type FocusState,
  type GrantRecord,
  type RoomItemSnapshot,
  type StartSessionResult,
} from './orchestrate';

/**
 * 专注应用层的 React 接线（P0-A Task 7）。FocusProvider 把 AsyncStorage、
 * AppState、AccessibilityInfo 注入 createFocusController（全部编排逻辑在
 * orchestrate.ts，node 可测），经 useSyncExternalStore 把快照暴露给屏幕。
 * 屏幕自持 1s interval 调 actions.tick(now)——store 不设定时器，保持可测。
 */

/** AsyncStorage 静态方法（getItem/setItem/removeItem）适配仓储接口。 */
const storageDriver: StorageDriver = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  remove: (key) => AsyncStorage.removeItem(key),
};

export interface FocusApi {
  activeSession: FocusSessionDoc | null;
  /** tick 驱动、始终由时间戳推导 */
  remainingSeconds: number;
  effectiveSeconds: number;
  today: { minutes: number; sessions: number };
  week: { minutes: number; targetMinutes: number };
  /** 全量本地历史（含 abandoned 审计文档；统计口径由各屏选择器过滤 completed） */
  history: readonly FocusSessionDoc[];
  /** 已授予成就（成就卡解锁态/解锁时刻） */
  granted: readonly GrantRecord[];
  /** 已解锁房间收藏物（房间页热点） */
  roomItems: readonly RoomItemSnapshot[];
  skin: SkinManifest;
  selectedSkinId: string;
  companion: CompanionRuntimeState;
  banner: { eventType: CompanionEventType; endsAt: number } | null;
  cooldown: { eventType: CompanionEventType; until: number } | null;
  reducedMotion: boolean;
  /** 最近一次完成新授予的成就（acknowledge 后清空） */
  newGrants: AchievementRuleKey[];
  /** 会话完成时置位，FocusCompleteScreen 消费 */
  completions: CompletionView | null;
  actions: {
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
  };
}

function toFocusApi(controller: FocusController, state: FocusState): FocusApi {
  return {
    activeSession: state.activeSession,
    remainingSeconds: state.remainingSeconds,
    effectiveSeconds: state.effectiveSeconds,
    today: {
      minutes: state.summary.todayMinutes,
      sessions: state.summary.todaySessions,
    },
    week: {
      minutes: state.summary.weekMinutes,
      targetMinutes: state.summary.weekTargetMinutes,
    },
    history: state.history,
    granted: state.granted,
    roomItems: state.roomItems,
    skin: state.skin,
    selectedSkinId: state.selectedSkinId,
    companion: state.companion,
    banner: state.banner,
    cooldown: state.cooldown,
    reducedMotion: state.reducedMotion,
    newGrants: state.newGrants,
    completions: state.completions,
    actions: {
      startSession: controller.startSession,
      pause: controller.pause,
      resume: controller.resume,
      drink: controller.drink,
      complete: controller.complete,
      abandon: controller.abandon,
      selectSkin: controller.selectSkin,
      tick: controller.tick,
      acknowledgeCompletions: controller.acknowledgeCompletions,
    },
  };
}

const FocusContext = createContext<FocusApi | null>(null);

export function FocusProvider({ children }: Readonly<{ children: ReactNode }>): React.JSX.Element {
  const [controller] = useState<FocusController>(() => {
    const achievementRepo = createAchievementRepository(storageDriver);
    return createFocusController({
      repo: createFocusRepository(storageDriver),
      achievementRepo,
      skinRepo: createSkinSelectionRepository(storageDriver),
      manifest: rainyStudyRoomManifest,
      loadGranted: async () => achievementRepo.loadGranted(),
      loadRoomItems: async () => achievementRepo.loadRoomItems(),
    });
  });

  useEffect(() => {
    void controller.restore(Date.now());
    // 后台→前台（含冷启动 active）：从磁盘重推导，绝不累加前台秒；
    // 后台期间无需任何计时工作（一切由时间戳推导）。
    const appStateSub = AppState.addEventListener('change', (status) => {
      if (status === 'active') void controller.onForeground(Date.now());
    });
    // reduce motion 显式线程化进每一次 advance/dispatch（绝不依赖默认值）
    const reduceMotionSub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (reducedMotion) => controller.setReducedMotion(reducedMotion),
    );
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reducedMotion) => controller.setReducedMotion(reducedMotion))
      .catch(() => undefined);
    return () => {
      appStateSub.remove();
      reduceMotionSub.remove();
    };
  }, [controller]);

  const snapshot = useSyncExternalStore(controller.subscribe, controller.getState);
  const value = useMemo<FocusApi>(
    () => toFocusApi(controller, snapshot),
    [controller, snapshot],
  );
  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

export function useFocus(): FocusApi {
  const value = useContext(FocusContext);
  if (!value) throw new Error('useFocus must be used inside FocusProvider');
  return value;
}
