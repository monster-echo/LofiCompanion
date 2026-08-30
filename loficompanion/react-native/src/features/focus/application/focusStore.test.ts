import { describe, expect, it } from 'vitest';
import { rainyStudyRoomManifest as manifest } from '../../skins/domain/rainyStudyRoom';
import type { AchievementRuleKey } from '../../achievements/domain/rules';
import { createAchievementRepository } from '../../achievements/data/achievementRepository';
import { createSkinSelectionRepository } from '../../skins/data/skinSelectionRepository';
import { createFocusRepository } from '../data/focusRepository';
import type { StorageDriver } from '../data/storageDriver';
import { createFocusController } from './orchestrate';

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
}

function makeController({ driver, granted = [] }: HarnessOptions) {
  return createFocusController({
    repo: createFocusRepository(driver),
    achievementRepo: createAchievementRepository(driver),
    skinRepo: createSkinSelectionRepository(driver),
    manifest,
    loadGranted: async () =>
      granted.map((ruleKey) => ({ ruleKey, grantedAtUtc: T0 })),
    loadRoomItems: async () => [],
  });
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

    // 开始：active 文档 + focusing 基态 + focus.started 横幅（4s 到期）
    expect(controller.startSession('homework', 25, T0)).toEqual({ ok: true });
    let s = controller.getState();
    expect(s.activeSession?.status).toBe('active');
    expect(s.activeSession?.plannedSeconds).toBe(1500);
    expect(s.remainingSeconds).toBe(1500);
    expect(s.companion.state).toBe('focusing');
    expect(s.banner).toEqual({ eventType: 'focus.started', endsAt: T0 + ACTION_MS });

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

describe('FocusStore 编排：喝水与冷却', () => {
  it('60s 冷却内的第二次喝水：companion 引用不变、横幅不被覆盖、cooldown 提示剩余', async () => {
    const driver = memoryDriver();
    const controller = makeController({ driver });
    await controller.restore(T0);
    controller.startSession('homework', 25, T0);
    controller.tick(T0 + ACTION_MS); // focus.started（80、不可打断）播完，喝水才能开播

    controller.drink(T0 + 5000);
    const first = controller.getState();
    expect(first.companion.playing?.eventType).toBe('wellness.drink');
    expect(first.banner).toEqual({
      eventType: 'wellness.drink',
      endsAt: T0 + 5000 + ACTION_MS,
    });

    controller.drink(T0 + 10_000);
    const second = controller.getState();
    expect(second.companion).toBe(first.companion); // 状态完全不变（同引用）
    expect(second.banner).toBe(first.banner);
    // 剩余 = ceil((T0+5000+60000 − (T0+10000))/1000) = 55s
    expect(second.cooldown).toEqual({
      eventType: 'wellness.drink',
      until: T0 + 10_000 + 55_000,
    });

    // 冷却过期后再喝：先把上一次动作 tick 播完（playing 不会自行过期），
    // 再触发 → 正常开播，lastFiredAt 更新
    controller.tick(T0 + 5000 + ACTION_MS);
    controller.drink(T0 + 66_000);
    const third = controller.getState();
    expect(third.companion.playing?.startedAt).toBe(T0 + 66_000);
    expect(third.banner?.endsAt).toBe(T0 + 66_000 + ACTION_MS);
    expect(third.companion.lastFiredAt['wellness.drink']).toBe(T0 + 66_000);
  });

  it('tick 推进：动作播完自动回归基态（清单 returnState），横幅到期清除', async () => {
    const driver = memoryDriver();
    const controller = makeController({ driver });
    await controller.restore(T0);
    controller.startSession('homework', 25, T0);

    controller.tick(T0 + 1000);
    expect(controller.getState().companion.playing?.eventType).toBe('focus.started');
    expect(controller.getState().banner).toEqual({
      eventType: 'focus.started',
      endsAt: T0 + ACTION_MS,
    });

    controller.tick(T0 + ACTION_MS);
    const s = controller.getState();
    expect(s.companion.playing).toBeNull();
    expect(s.companion.state).toBe('focusing'); // drink/focus.started 播完回 focusing
    expect(s.banner).toBeNull(); // now >= endsAt
  });

  it('播放期间 tick：基态被 focus.paused 改写后，队列事件按优先级接力播放', async () => {
    const driver = memoryDriver();
    const controller = makeController({ driver });
    await controller.restore(T0);
    controller.startSession('homework', 25, T0);
    controller.drink(T0 + 1000); // focus.started 不可打断 → wellness.drink 入队
    controller.pause(T0 + 2000); // 基态立即 paused，focus.paused(90) 也入队

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

  it('无活动会话时的 complete/pause/resume/abandon 均为安全空操作', async () => {
    const driver = memoryDriver();
    const controller = makeController({ driver });
    await controller.restore(T0);

    expect(() => {
      controller.pause(T0);
      controller.resume(T0);
      controller.drink(T0);
      controller.complete(T0);
      controller.abandon(T0);
      controller.tick(T0);
    }).not.toThrow();
    expect(controller.getState().activeSession).toBeNull();
    await controller.flush();
    await expect(createFocusRepository(driver).loadHistory()).resolves.toEqual([]);
  });

  it('reducedMotion 显式生效：动作时长降为 1000ms，横幅到期随之缩短', async () => {
    const driver = memoryDriver();
    const controller = makeController({ driver });
    await controller.restore(T0);
    controller.setReducedMotion(true);
    controller.startSession('homework', 25, T0);

    const s = controller.getState();
    expect(s.reducedMotion).toBe(true);
    expect(s.companion.playing?.durationMs).toBe(1000);
    expect(s.banner?.endsAt).toBe(T0 + 1000);

    controller.tick(T0 + 1000);
    expect(controller.getState().companion.playing).toBeNull();
    expect(controller.getState().banner).toBeNull();
  });
});
