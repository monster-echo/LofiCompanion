import { describe, expect, it } from 'vitest';
import { rainyStudyRoomManifest as manifest } from '../../skins/domain/rainyStudyRoom.generated';
import type { SkinManifest } from '../../skins/domain/types';
import type { AchievementRuleKey } from '../../achievements/domain/rules';
import { createAchievementRepository } from '../../achievements/data/achievementRepository';
import { createSkinSelectionRepository } from '../../skins/data/skinSelectionRepository';
import { createFocusRepository } from '../data/focusRepository';
import type { StorageDriver } from '../data/storageDriver';
import type { FocusMusicEffects } from '../../music/domain/musicController';
import { createFocusController } from './orchestrate';

/** 阳光教室替身（P2 皮肤云端化后不再内置；多皮肤测试只需第二套清单形态） */
const sunnyClassroomManifest: SkinManifest = {
  ...manifest,
  id: 'sunny-classroom-v1',
  slug: 'sunny-classroom',
  name: '阳光教室',
};

/**
 * FocusStore 编排测试（P0-A Task 7）。React 上下文无法在 node 环境渲染，
 * 全部断言走 orchestrate.ts 的 createFocusController——FocusStore.tsx 只是
 * 它的薄封装（AppState/AccessibilityInfo 注入 + useSyncExternalStore）。
 */

/** 测试内 in-memory driver：接口与 AsyncStorage 静态方法结构一致。 */
function memoryDriver(): StorageDriver {
  const map = new Map<string, string>();
  return {
    async get(key) {
      return map.get(key) ?? null;
    },
    async set(key, value) {
      map.set(key, value);
    },
    async remove(key) {
      map.delete(key);
    },
  };
}

interface HarnessOptions {
  driver: StorageDriver;
  granted?: AchievementRuleKey[];
  /** 覆盖皮肤注册表（自动喝水排程测试用短间隔；多皮肤切换测试注入多套） */
  manifests?: readonly SkinManifest[];
  /** 确定性随机源；缺省恒 0（= 取区间下界，可复现） */
  rng?: () => number;
  /** 背景音乐效果桩（音乐钩子时序测试用） */
  music?: FocusMusicEffects;
}

function makeController({ driver, granted = [], manifests = [manifest], rng, music }: HarnessOptions) {
  return createFocusController({
    repo: createFocusRepository(driver),
    achievementRepo: createAchievementRepository(driver),
    skinRepo: createSkinSelectionRepository(driver),
    manifests,
    rng,
    music,
    loadGranted: async () =>
      granted.map((ruleKey) => ({ ruleKey, grantedAtUtc: T0 })),
    loadRoomItems: async () => [],
  });
}

/** 录制型音乐效果桩：按序记录钩子调用（音乐时序断言用） */
function recordingMusic() {
  const calls: string[] = [];
  const fake: FocusMusicEffects = {
    sessionStarted: () => calls.push('started'),
    paused: () => calls.push('paused'),
    resumed: () => calls.push('resumed'),
    sessionEnded: () => calls.push('ended'),
  };
  return { calls, fake };
}

// 固定时刻：2026-08-30 10:00 Asia/Shanghai（周日）。全程无 Date.now()。
const T0 = Date.UTC(2026, 7, 30, 2, 0, 0);
const MIN = 60_000;
const ACTION_MS = 4000; // 内置清单静态动作时长（reducedMotion=false）

describe('FocusStore 编排：完整专注流程', () => {
  it('开始→暂停→继续→完成：历史落盘、first_focus 授予、bookmark 解锁、completions 就绪', async () => {
    const driver = memoryDriver();
    const controller = makeController({ driver });
    await controller.restore(T0);
    expect(controller.getState().hydrated).toBe(true);

    // 开始：active 文档 + focusing 基态 + focus.started 开播
    expect(controller.startSession('homework', 25, T0)).toEqual({ ok: true });
    let s = controller.getState();
    expect(s.activeSession?.status).toBe('active');
    expect(s.activeSession?.plannedSeconds).toBe(1500);
    expect(s.remainingSeconds).toBe(1500);
    expect(s.companion.state).toBe('focusing');
    expect(s.companion.playing?.eventType).toBe('focus.started');

    // 暂停：文档 paused、陪伴基态 paused
    controller.pause(T0 + 10 * MIN);
    s = controller.getState();
    expect(s.activeSession?.status).toBe('paused');
    expect(s.activeSession?.pauses).toEqual([{ start: T0 + 10 * MIN, end: T0 + 10 * MIN }]);
    expect(s.companion.state).toBe('paused');

    // 继续：占位区间被闭合
    controller.resume(T0 + 15 * MIN);
    s = controller.getState();
    expect(s.activeSession?.status).toBe('active');
    expect(s.activeSession?.pauses).toEqual([
      { start: T0 + 10 * MIN, end: T0 + 15 * MIN },
    ]);

    // tick：显示值纯时间戳推导（墙钟 20min − 暂停 5min = 有效 15min）
    controller.tick(T0 + 20 * MIN);
    s = controller.getState();
    expect(s.effectiveSeconds).toBe(900);
    expect(s.remainingSeconds).toBe(600);

    // 完成：墙钟 30min − 暂停 5min = 有效 25min = 计划时长
    controller.complete(T0 + 30 * MIN);
    s = controller.getState();
    expect(s.activeSession).toBeNull();
    expect(s.companion.state).toBe('completed');
    expect(s.completions?.session.status).toBe('completed');
    expect(s.completions?.session.completedAtUtc).toBe(T0 + 30 * MIN);
    expect(s.completions?.todayMinutes).toBe(25);
    expect(s.completions?.weekMinutes).toBe(25);
    expect(s.completions?.grants).toEqual(['first_focus']);
    expect(s.newGrants).toEqual(['first_focus']);
    expect(s.summary.todayMinutes).toBe(25);
    expect(s.summary.todaySessions).toBe(1);
    expect(s.summary.weekMinutes).toBe(25);
    expect(s.summary.weekTargetMinutes).toBe(300);
    // 成就/房间快照同步进状态（成就卡/房间页免等磁盘）
    expect(s.history).toHaveLength(1);
    expect(s.granted).toEqual([{ ruleKey: 'first_focus', grantedAtUtc: T0 + 30 * MIN }]);
    expect(s.roomItems).toEqual([{ itemId: 'bookmark', unlockedAtUtc: T0 + 30 * MIN }]);

    await controller.flush();
    const repo = createFocusRepository(driver);
    const history = await repo.loadHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      status: 'completed',
      activity: 'homework',
      plannedSeconds: 1500,
      startedAtUtc: T0,
      completedAtUtc: T0 + 30 * MIN,
      pauses: [{ start: T0 + 10 * MIN, end: T0 + 15 * MIN }],
    });
    expect(await repo.loadActive()).toBeNull();

    const achievementRepo = createAchievementRepository(driver);
    expect(await achievementRepo.loadGranted()).toEqual([
      {
        ruleKey: 'first_focus',
        grantedAtUtc: T0 + 30 * MIN,
        sourceSessionId: history[0].id,
        ruleVersion: 1,
      },
    ]);
    expect(await achievementRepo.loadRoomItems()).toEqual([
      { itemId: 'bookmark', unlockedAtUtc: T0 + 30 * MIN, sourceRuleKey: 'first_focus' },
    ]);

    // 确认后清空 completions + newGrants
    controller.acknowledgeCompletions();
    expect(controller.getState().completions).toBeNull();
    expect(controller.getState().newGrants).toEqual([]);
  });

  it('已完成授予后：新控制器带已授予清单，重复完成不再发 newGrants（幂等）', async () => {
    const driver = memoryDriver();
    const first = makeController({ driver });
    await first.restore(T0);
    first.startSession('reading', 25, T0);
    first.complete(T0 + 25 * MIN);
    expect(first.getState().newGrants).toEqual(['first_focus']);
    await first.flush();

    const second = makeController({ driver, granted: ['first_focus'] });
    await second.restore(T0 + 60 * MIN);
    second.startSession('free', 15, T0 + 60 * MIN);
    second.complete(T0 + 75 * MIN);
    expect(second.getState().completions?.grants).toEqual([]);
    expect(second.getState().newGrants).toEqual([]);
    expect(second.getState().summary.todayMinutes).toBe(40);
    expect(second.getState().summary.todaySessions).toBe(2);
  });
});

describe('FocusStore 编排：强杀恢复', () => {
  it('计划结束后 relaunch：deriveOnLaunch 自动补完成（完成时刻取推导值，非 now）', async () => {
    const driver = memoryDriver();
    const first = makeController({ driver });
    await first.restore(T0);
    first.startSession('reading', 25, T0);
    await first.flush(); // 模拟 active 快照已写盘

    // 全新控制器 = 全新进程：同一份存储
    const second = makeController({ driver });
    await second.restore(T0 + 30 * MIN);
    const s = second.getState();
    expect(s.activeSession).toBeNull();
    expect(s.completions?.session.status).toBe('completed');
    expect(s.completions?.session.completedAtUtc).toBe(T0 + 25 * MIN);
    expect(s.completions?.grants).toEqual(['first_focus']);
    expect(s.newGrants).toEqual(['first_focus']);
    expect(s.companion.state).toBe('completed');
    // 快照入状态：授予时刻取结算时刻（强杀补完成的 now）
    expect(s.granted).toEqual([
      { ruleKey: 'first_focus', grantedAtUtc: T0 + 30 * MIN },
    ]);
    expect(s.roomItems.map((item) => item.itemId)).toEqual(['bookmark']);

    const repo = createFocusRepository(driver);
    expect(await repo.loadActive()).toBeNull();
    const history = await repo.loadHistory();
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('completed');
    const achievementRepo = createAchievementRepository(driver);
    expect((await achievementRepo.loadGranted()).map((g) => g.ruleKey)).toEqual([
      'first_focus',
    ]);
    expect((await achievementRepo.loadRoomItems()).map((i) => i.itemId)).toEqual([
      'bookmark',
    ]);
  });

  it('仍在进行中的会话：按时间戳恢复剩余时间（后台 1h 前台自动补完成）', async () => {
    const driver = memoryDriver();
    const first = makeController({ driver });
    await first.restore(T0);
    first.startSession('homework', 25, T0);
    await first.flush();

    // 中途 relaunch：剩余时间由时间戳推导（10min30s 处恢复 → 14min30s）
    const mid = makeController({ driver });
    await mid.restore(T0 + 10 * MIN + 500);
    expect(mid.getState().activeSession?.status).toBe('active');
    expect(mid.getState().remainingSeconds).toBe(900); // floor(600500ms)=600s 已过
    expect(mid.getState().completions).toBeNull();

    // 后台 1h 后回前台：deriveOnLaunch 补完成并结算
    await mid.onForeground(T0 + 90 * MIN);
    const s = mid.getState();
    expect(s.activeSession).toBeNull();
    expect(s.completions?.session.completedAtUtc).toBe(T0 + 25 * MIN);
    expect(s.completions?.grants).toEqual(['first_focus']);
  });

  it('冷启动恢复：活跃会话重启 lofi（sessionStarted）；暂停会话恢复保持无声', async () => {
    const driver = memoryDriver();
    const first = makeController({ driver });
    await first.restore(T0);
    first.startSession('homework', 25, T0);
    await first.flush();

    // 活跃会话 relaunch：原生音频层已随上次进程消亡，恢复即对齐 lofi 播放
    const activeMusic = recordingMusic();
    const mid = makeController({ driver, music: activeMusic.fake });
    await mid.restore(T0 + 10 * MIN);
    expect(mid.getState().activeSession?.status).toBe('active');
    expect(activeMusic.calls).toEqual(['started']);

    // 暂停态 relaunch：恢复不播（paused 语义），由 resume() 恢复
    mid.pause(T0 + 11 * MIN);
    await mid.flush();
    const pausedMusic = recordingMusic();
    const paused = makeController({ driver, music: pausedMusic.fake });
    await paused.restore(T0 + 12 * MIN);
    expect(paused.getState().activeSession?.status).toBe('paused');
    expect(pausedMusic.calls).toEqual([]);
  });

  it('暂停中文档恢复：保持暂停、专注时钟冻结（暂停区间按 now 展开）', async () => {
    const driver = memoryDriver();
    const first = makeController({ driver });
    await first.restore(T0);
    first.startSession('homework', 25, T0);
    first.pause(T0 + 5 * MIN);
    await first.flush();

    const second = makeController({ driver });
    await second.restore(T0 + 40 * MIN);
    const s = second.getState();
    expect(s.activeSession?.status).toBe('paused');
    expect(s.effectiveSeconds).toBe(300); // 墙钟 40min − 开放暂停 35min
    expect(s.remainingSeconds).toBe(1200);
    expect(s.companion.state).toBe('paused');
    expect(s.completions).toBeNull();
  });

  it('前台重推导不破坏已就绪的 completions（完成页停留期间切后台再回来）', async () => {
    const driver = memoryDriver();
    const controller = makeController({ driver });
    await controller.restore(T0);
    controller.startSession('homework', 25, T0);
    controller.complete(T0 + 25 * MIN);
    await controller.flush();

    await controller.onForeground(T0 + 40 * MIN);
    expect(controller.getState().completions?.grants).toEqual(['first_focus']);
    expect(controller.getState().activeSession).toBeNull();
  });
});

describe('FocusStore 编排：自动喝水（主题排程）', () => {
  /** 固定间隔皮肤：min=max → 到点确定（与 rng 无关） */
  const everyMinutes = (minutes: number): SkinManifest => ({
    ...manifest,
    wellness: {
      autoDrink: { enabled: true, minIntervalMinutes: minutes, maxIntervalMinutes: minutes },
    },
  });

  it('按主题排程到点触发：开播、冷却就位、立即重排；播完回归 focusing', async () => {
    const driver = memoryDriver();
    const controller = makeController({ driver, rng: () => 0 });
    await controller.restore(T0);
    controller.startSession('homework', 25, T0);
    // 默认清单（skin.yaml）：18–30 分钟区间，rng=0 → 取下界 18 分钟
    expect(controller.getState().nextAutoDrinkAt).toBe(T0 + 18 * MIN);

    controller.tick(T0 + ACTION_MS); // 未到点：不触发
    expect(controller.getState().companion.playing).toBeNull();
    expect(controller.getState().nextAutoDrinkAt).toBe(T0 + 18 * MIN);

    controller.tick(T0 + 18 * MIN); // 到点：wellness.drink 开播
    const s = controller.getState();
    expect(s.companion.playing?.eventType).toBe('wellness.drink');
    expect(s.companion.playing?.startedAt).toBe(T0 + 18 * MIN);
    // 首次开播不产生冷却提示（冷却提示只在冷却窗口内的再次派发时出现）
    expect(s.cooldown).toBeNull();
    expect(s.nextAutoDrinkAt).toBe(T0 + 36 * MIN); // 触发即重排下一轮

    controller.tick(T0 + 18 * MIN + ACTION_MS); // 播完回归
    expect(controller.getState().companion.playing).toBeNull();
    expect(controller.getState().companion.state).toBe('focusing');
  });

  it('60s 冷却内到点的下一次排程：不重播、状态引用不变、冷却提示刷新', async () => {
    const driver = memoryDriver();
    const controller = makeController({ driver, manifests: [everyMinutes(0.5)] }); // 每 30s
    await controller.restore(T0);
    controller.startSession('homework', 25, T0);

    controller.tick(T0 + 30_000); // 第 1 次：开播
    expect(controller.getState().companion.playing?.eventType).toBe('wellness.drink');
    expect(controller.getState().nextAutoDrinkAt).toBe(T0 + 60_000);

    controller.tick(T0 + 34_000); // 第一杯播完、回归基态
    const idle = controller.getState();
    expect(idle.companion.playing).toBeNull();

    controller.tick(T0 + 60_000); // 落在 60s 冷却内：状态完全不变，仅刷新冷却提示
    const s = controller.getState();
    expect(s.companion).toBe(idle.companion);
    // 剩余 = 60s − (60s − 30s) = 30s → until = T0 + 90s
    expect(s.cooldown).toEqual({ eventType: 'wellness.drink', until: T0 + 90_000 });
    expect(s.nextAutoDrinkAt).toBe(T0 + 90_000);

    controller.tick(T0 + 90_000); // 冷却恰好过期：正常开播
    expect(controller.getState().companion.playing?.eventType).toBe('wellness.drink');
    expect(controller.getState().companion.playing?.startedAt).toBe(T0 + 90_000);
  });

  it('暂停期间不消耗喝水排程：恢复后至少再等一个最小间隔', async () => {
    const driver = memoryDriver();
    const controller = makeController({ driver, rng: () => 0 }); // 18 分钟固定
    await controller.restore(T0);
    controller.startSession('homework', 25, T0);
    controller.pause(T0 + 5 * MIN);
    controller.resume(T0 + 15 * MIN);
    // 排程原为 T0+18min；恢复钳制为 max(原值, 恢复时刻+18min) = T0+33min
    expect(controller.getState().nextAutoDrinkAt).toBe(T0 + 33 * MIN);
    controller.tick(T0 + 20 * MIN);
    expect(controller.getState().companion.playing).toBeNull();
  });

  it('tick 推进：动作播完自动回归基态（清单 returnState）', async () => {
    const driver = memoryDriver();
    const controller = makeController({ driver });
    await controller.restore(T0);
    controller.startSession('homework', 25, T0);

    controller.tick(T0 + 1000);
    expect(controller.getState().companion.playing?.eventType).toBe('focus.started');

    controller.tick(T0 + ACTION_MS);
    const s = controller.getState();
    expect(s.companion.playing).toBeNull();
    expect(s.companion.state).toBe('focusing'); // drink/focus.started 播完回 focusing
  });

  it('播放期间到点：focus.started 不可打断 → 喝水入队，focus.paused 后按优先级接力', async () => {
    // 每 2s 一次排程：T0+2s 的到点落在 focus.started 播放窗口内
    const driver = memoryDriver();
    const controller = makeController({ driver, manifests: [everyMinutes(2 / 60)] });
    await controller.restore(T0);
    controller.startSession('homework', 25, T0); // next = T0+2s；focus.started 播放中

    controller.tick(T0 + 3000); // 到点：focus.started（80、不可打断）→ drink(70) 入队
    expect(controller.getState().companion.playing?.eventType).toBe('focus.started');
    expect(controller.getState().companion.queue).toHaveLength(1);
    controller.pause(T0 + 3500); // 基态立即 paused，focus.paused(90) 也入队

    controller.tick(T0 + ACTION_MS); // focus.started 播完 → 弹出优先级最高的 focus.paused
    const s = controller.getState();
    expect(s.companion.playing?.eventType).toBe('focus.paused');
    expect(s.companion.state).toBe('paused');

    // 队列里的 wellness.drink 仍在保鲜期（≤10s）：paused 播完接力播放
    controller.tick(T0 + 2 * ACTION_MS);
    expect(controller.getState().companion.playing?.eventType).toBe('wellness.drink');
    expect(controller.getState().companion.state).toBe('paused'); // 基态不被 drink 改写

    // drink 播完：按清单 returnState('focusing') 回归——状态机语义以域为准，
    // 文档仍是 paused（计时域与陪伴域各自独立，屏幕以 activeSession 为准）
    controller.tick(T0 + 3 * ACTION_MS);
    expect(controller.getState().companion.playing).toBeNull();
    expect(controller.getState().companion.state).toBe('focusing');
    expect(controller.getState().activeSession?.status).toBe('paused');
  });
});

describe('FocusStore 编排：输入守卫与外围动作', () => {
  it('startSession 校验：非法输入 invalid；会话进行中 alreadyActive', async () => {
    const driver = memoryDriver();
    const controller = makeController({ driver });
    await controller.restore(T0);

    expect(controller.startSession('bogus' as never, 25, T0)).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(controller.startSession('homework', 3, T0)).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(controller.startSession('homework', 25, T0)).toEqual({ ok: true });
    expect(controller.startSession('reading', 25, T0 + 1)).toEqual({
      ok: false,
      reason: 'alreadyActive',
    });
    expect(controller.getState().activeSession?.activity).toBe('homework');
  });

  it('放弃：历史保留 abandoned 文档但不入统计、不授予成就，陪伴回 ready', async () => {
    const driver = memoryDriver();
    const controller = makeController({ driver });
    await controller.restore(T0);
    controller.startSession('homework', 25, T0);
    controller.abandon(T0 + 7 * MIN);

    const s = controller.getState();
    expect(s.activeSession).toBeNull();
    expect(s.companion.state).toBe('ready');
    expect(s.summary.todaySessions).toBe(0);
    expect(s.summary.todayMinutes).toBe(0);
    expect(s.completions).toBeNull();

    await controller.flush();
    const repo = createFocusRepository(driver);
    const history = await repo.loadHistory();
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('abandoned');
    expect(history[0].abandonedAtUtc).toBe(T0 + 7 * MIN);
    expect(await repo.loadActive()).toBeNull();
    expect(await createAchievementRepository(driver).loadGranted()).toEqual([]);
  });

  it('selectSkin：写入选择并持久化；未知皮肤 id 忽略', async () => {
    const driver = memoryDriver();
    const controller = makeController({ driver });
    await controller.restore(T0);

    controller.selectSkin('some-other-skin');
    expect(controller.getState().selectedSkinId).toBe(manifest.id);

    controller.selectSkin(manifest.id);
    expect(controller.getState().selectedSkinId).toBe(manifest.id);
    await controller.flush();
    await expect(createSkinSelectionRepository(driver).loadSelected()).resolves.toEqual({
      skinId: manifest.id,
      selectedAtUtc: expect.any(Number),
    });
  });

  it('多皮肤 selectSkin：切到阳光教室同名状态带过、落盘；restore 解析存量选择', async () => {
    const driver = memoryDriver();
    const controller = makeController({ driver, manifests: [manifest, sunnyClassroomManifest] });
    await controller.restore(T0);
    expect(controller.getState().skin.slug).toBe('rainy-study-room');

    // 计时中切肤：focusing 同名带过，不回默认基态
    controller.startSession('homework', 25, T0);
    expect(controller.getState().companion.state).toBe('focusing');
    controller.selectSkin(sunnyClassroomManifest.id);
    let s = controller.getState();
    expect(s.skin.id).toBe('sunny-classroom-v1');
    expect(s.selectedSkinId).toBe('sunny-classroom-v1');
    expect(s.companion.state).toBe('focusing');
    await controller.flush();
    await expect(createSkinSelectionRepository(driver).loadSelected()).resolves.toMatchObject({
      skinId: 'sunny-classroom-v1',
    });

    // 冷启动：存量选择解析回阳光教室清单
    const relaunched = makeController({ driver, manifests: [manifest, sunnyClassroomManifest] });
    await relaunched.restore(T0 + 10 * MIN);
    expect(relaunched.getState().skin.slug).toBe('sunny-classroom');
    expect(relaunched.getState().selectedSkinId).toBe('sunny-classroom-v1');

    // slug 也能命中（商店路由口径）；彻底未知的 id 忽略
    relaunched.selectSkin('rainy-study-room');
    expect(relaunched.getState().skin.slug).toBe('rainy-study-room');
    relaunched.selectSkin('nonexistent-skin');
    expect(relaunched.getState().skin.slug).toBe('rainy-study-room');
  });

  it('切到 autoDrink 关闭的皮肤：计时中的喝水排程清空', async () => {
    const driver = memoryDriver();
    const noAutoDrink: SkinManifest = {
      ...sunnyClassroomManifest,
      wellness: {
        autoDrink: { enabled: false, minIntervalMinutes: 18, maxIntervalMinutes: 30 },
      },
    };
    const controller = makeController({ driver, manifests: [manifest, noAutoDrink], rng: () => 0 });
    await controller.restore(T0);
    controller.startSession('homework', 25, T0);
    expect(controller.getState().nextAutoDrinkAt).toBe(T0 + 18 * MIN);

    controller.selectSkin(noAutoDrink.id);
    expect(controller.getState().nextAutoDrinkAt).toBeNull();
  });

  it('无活动会话时的 complete/pause/resume/abandon 均为安全空操作', async () => {
    const driver = memoryDriver();
    const controller = makeController({ driver });
    await controller.restore(T0);

    expect(() => {
      controller.pause(T0);
      controller.resume(T0);
      controller.complete(T0);
      controller.abandon(T0);
      controller.tick(T0);
    }).not.toThrow();
    expect(controller.getState().activeSession).toBeNull();
    await controller.flush();
    await expect(createFocusRepository(driver).loadHistory()).resolves.toEqual([]);
  });

  it('reducedMotion 显式生效：动作时长降为 1000ms', async () => {
    const driver = memoryDriver();
    const controller = makeController({ driver });
    await controller.restore(T0);
    controller.setReducedMotion(true);
    controller.startSession('homework', 25, T0);

    const s = controller.getState();
    expect(s.reducedMotion).toBe(true);
    expect(s.companion.playing?.durationMs).toBe(1000);

    controller.tick(T0 + 1000);
    expect(controller.getState().companion.playing).toBeNull();
  });
});

describe('FocusStore 编排：背景音乐钩子时序', () => {
  it('start→pause→resume→complete：钩子按真实转换触发一次', async () => {
    const driver = memoryDriver();
    const music = recordingMusic();
    const controller = makeController({ driver, music: music.fake });
    await controller.restore(T0);

    controller.startSession('homework', 25, T0);
    expect(music.calls).toEqual(['started']);

    controller.pause(T0 + MIN);
    controller.pause(T0 + 2 * MIN); // 幂等：已暂停不再触发
    expect(music.calls).toEqual(['started', 'paused']);

    controller.resume(T0 + 3 * MIN);
    controller.resume(T0 + 4 * MIN); // 幂等：活跃中 resume no-op
    expect(music.calls).toEqual(['started', 'paused', 'resumed']);

    controller.complete(T0 + 25 * MIN);
    expect(music.calls).toEqual(['started', 'paused', 'resumed', 'ended']);
  });

  it('abandon 与强杀恢复（派生完成）都要停音乐', async () => {
    const driver = memoryDriver();

    // abandon 路径
    const musicA = recordingMusic();
    const a = makeController({ driver, music: musicA.fake });
    await a.restore(T0);
    a.startSession('homework', 25, T0);
    a.abandon(T0 + 5 * MIN);
    expect(musicA.calls).toEqual(['started', 'ended']);

    // 冷启动恢复：active 文档已在后台越过终点 → applyDerived 派生 completed
    await createFocusRepository(driver).saveActive({
      id: 'session-x',
      clientRequestId: 'req-x',
      activity: 'homework',
      plannedSeconds: 25 * 60,
      status: 'active',
      startedAtUtc: T0,
      pauses: [],
      docVersion: 1,
    });
    const musicB = recordingMusic();
    const b = makeController({ driver, music: musicB.fake });
    await b.restore(T0 + 30 * MIN);
    expect(b.getState().activeSession).toBeNull();
    expect(b.getState().completions).not.toBeNull();
    expect(musicB.calls).toEqual(['ended']);
  });

  it('无 music dep（旧调用方）：转换照常，不抛错', async () => {
    const driver = memoryDriver();
    const controller = makeController({ driver });
    await controller.restore(T0);
    controller.startSession('reading', 15, T0);
    controller.complete(T0 + 15 * MIN);
    expect(controller.getState().activeSession).toBeNull();
  });
});
