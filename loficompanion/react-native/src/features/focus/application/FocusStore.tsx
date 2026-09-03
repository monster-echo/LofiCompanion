import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BUILT_IN_SKINS } from '../../skins/domain/registry';
import { createSkinRegistry } from '../../skins/domain/skinRegistry';
import { fetchRemoteSkins } from '../../skins/data/remoteSkinsRepository';
import type {
  CompanionEventType,
  SkinManifest,
} from '../../skins/domain/types';
import type { CompanionRuntimeState } from '../../companion/domain/stateMachine';
import { createAchievementRepository } from '../../achievements/data/achievementRepository';
import { createSkinSelectionRepository } from '../../skins/data/skinSelectionRepository';
import { getMusicController } from '../../music/data/expoAudioMusicController';
import { useApp } from '../../../state/AppStore';
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
import type { MusicController } from '../../music/domain/musicController';

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
  /** 可选皮肤全量（内置 + 已下载的远端皮肤）；画廊/详情页据此渲染 */
  skins: readonly SkinManifest[];
  companion: CompanionRuntimeState;
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
    complete(now: number): void;
    abandon(now: number): void;
    selectSkin(skinId: string): void;
    tick(now: number): void;
    acknowledgeCompletions(): void;
    /** 专注页静音开关 → 音乐控制器（focusQuickPrefs.muted 的落地点） */
    setMusicMuted(muted: boolean): void;
    /** 拉取远端皮肤目录并物化到注册表（挂载/购买成功后调用；免费皮肤访客也可拉） */
    refreshSkins(): void;
  };
}

function toFocusApi(
  controller: FocusController,
  state: FocusState,
  music: MusicController,
  skins: readonly SkinManifest[],
  refreshSkins: () => void,
): FocusApi {
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
    skins,
    companion: state.companion,
    cooldown: state.cooldown,
    reducedMotion: state.reducedMotion,
    newGrants: state.newGrants,
    completions: state.completions,
    actions: {
      startSession: controller.startSession,
      pause: controller.pause,
      resume: controller.resume,
      complete: controller.complete,
      abandon: controller.abandon,
      selectSkin: controller.selectSkin,
      tick: controller.tick,
      acknowledgeCompletions: controller.acknowledgeCompletions,
      setMusicMuted: (muted) => music.setMuted(muted),
      refreshSkins,
    },
  };
}

const FocusContext = createContext<FocusApi | null>(null);

export function FocusProvider({ children }: Readonly<{ children: ReactNode }>): React.JSX.Element {
  // 远端皮肤目录（P0-B）：注册表是内置+远端的可观察合并视图，
  // getManifests 让 orchestrate 的选肤/恢复实时看到新皮肤
  const [registry] = useState(() => createSkinRegistry(BUILT_IN_SKINS));
  const { signedIn } = useApp();

  const [controller] = useState<FocusController>(() => {
    const achievementRepo = createAchievementRepository(storageDriver);
    const music = getMusicController();
    return createFocusController({
      repo: createFocusRepository(storageDriver),
      achievementRepo,
      skinRepo: createSkinSelectionRepository(storageDriver),
      manifests: BUILT_IN_SKINS,
      getManifests: registry.getAll,
      loadGranted: async () => achievementRepo.loadGranted(),
      loadRoomItems: async () => achievementRepo.loadRoomItems(),
      music,
    });
  });
  // toFocusApi 需要：静音开关直达控制器（setMusicMuted）
  const [music] = useState<MusicController>(() => getMusicController());

  const refreshSkins = useCallback(() => {
    // 云端皮肤目录对访客开放（免费 manifest 匿名可取，付费由服务端 401 门禁）；
    // 目录拉取失败时仓储内部回退磁盘缓存（离线可用已拉取的皮肤）
    void fetchRemoteSkins().then((remote) => {
      registry.setRemote(remote);
      // 上次选择的云端皮肤此刻可解析时自动切回（冷启动暂落默认皮肤的场景）
      controller.reattachSkinCatalog();
    });
  }, [controller, registry]);

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

  // 远端皮肤目录：挂载与登录态切换时拉取（购买解锁后详情页也会再拉一轮）
  useEffect(() => {
    refreshSkins();
  }, [refreshSkins, signedIn]);

  const skins = useSyncExternalStore(registry.subscribe, registry.getAll);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getState);
  const value = useMemo<FocusApi>(
    () => toFocusApi(controller, snapshot, music, skins, refreshSkins),
    [controller, snapshot, music, skins, refreshSkins],
  );
  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

export function useFocus(): FocusApi {
  const value = useContext(FocusContext);
  if (!value) throw new Error('useFocus must be used inside FocusProvider');
  return value;
}
