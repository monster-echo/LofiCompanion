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
import { downloadSkinPack, hydrateRemoteSkins } from '../../skins/data/remoteSkinsRepository';
import { createSkinPackController } from '../../skins/application/skinPackController';
import type { SkinPackStatus } from '../../skins/application/skinPackController';
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
  /** 资源包下载状态机（详情页「下载资源包并使用」的进度真源） */
  pack: {
    statusFor(slug: string): SkinPackStatus;
    subscribe(listener: () => void): () => void;
  };
  companion: CompanionRuntimeState;
  cooldown: { eventType: CompanionEventType; until: number } | null;
  reducedMotion: boolean;
  /** 最近一次完成新授予的成就（acknowledge 后清空） */
  newGrants: AchievementRuleKey[];
  /** 会话完成时置位，FocusActiveScreen 的结算覆盖层消费（acknowledge 后清空） */
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
    /** 拉取远端皮肤目录并水合（挂载/登录态变化时调用；只收齐套包，绝不下载） */
    refreshSkins(): void;
    /** 按需下载单个资源包（全有或全无）；成功即已并入注册表，可直接 selectSkin */
    downloadSkinPack(slug: string): Promise<SkinManifest>;
  };
}

function toFocusApi(
  controller: FocusController,
  state: FocusState,
  music: MusicController,
  skins: readonly SkinManifest[],
  pack: FocusApi['pack'],
  downloadSkinPack: (slug: string) => Promise<SkinManifest>,
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
    pack,
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
      downloadSkinPack,
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

  // 资源包按需下载（资源包模型）：成功即并入注册表并重挂选肤，详情页随即
  // selectSkin+back。闭包捕获 registry/controller，两者都是 useState 单例。
  const [packController] = useState(() =>
    createSkinPackController({
      downloadPack: (slug, sink) => downloadSkinPack(slug, sink),
      onPackReady: (manifest) => {
        registry.upsertRemote(manifest);
        // 上次选择的云端皮肤此刻可解析时自动切回（冷启动暂落默认皮肤的场景）
        controller.reattachSkinCatalog();
      },
    }));

  const refreshSkins = useCallback(() => {
    // 云端皮肤目录对访客开放（免费 manifest 匿名可取，付费由服务端 401 门禁）；
    // 目录拉取失败时仓储内部回退磁盘缓存（离线可用已获的包）。水合绝不下载：
    // 媒体获取收敛到详情页的 downloadSkinPack（资源包按需模型）。
    void hydrateRemoteSkins().then((remote) => {
      registry.setRemote(remote);
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

  // 远端皮肤目录：挂载与登录态切换时水合（已获包不失联；媒体按需下载）
  useEffect(() => {
    refreshSkins();
  }, [refreshSkins, signedIn]);

  const skins = useSyncExternalStore(registry.subscribe, registry.getAll);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getState);
  const value = useMemo<FocusApi>(
    () =>
      toFocusApi(
        controller,
        snapshot,
        music,
        skins,
        { statusFor: packController.statusFor, subscribe: packController.subscribe },
        (slug) => packController.downloadPack(slug),
        refreshSkins,
      ),
    [controller, snapshot, music, skins, packController, refreshSkins],
  );
  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

export function useFocus(): FocusApi {
  const value = useContext(FocusContext);
  if (!value) throw new Error('useFocus must be used inside FocusProvider');
  return value;
}
