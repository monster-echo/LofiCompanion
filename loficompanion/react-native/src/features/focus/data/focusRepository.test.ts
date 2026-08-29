import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_DEFS } from '../../achievements/domain/rules';
import type { ActivityType, FocusSessionDoc } from '../domain/types';
import { createAchievementRepository } from '../../achievements/data/achievementRepository';
import { createSkinSelectionRepository } from '../../skins/data/skinSelectionRepository';
import {
  FOCUS_ACTIVE_KEY,
  FOCUS_HISTORY_KEY,
  createFocusRepository,
} from './focusRepository';
import { summarize } from './summarize';
import type { StorageDriver } from './storageDriver';

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

// 固定时刻：2026-08-30 10:00 Asia/Shanghai（周日）。全程无 Date.now()。
const T0 = Date.UTC(2026, 7, 30, 2, 0, 0);
const OFFSET = 480; // Asia/Shanghai
const DAY = 86_400_000;

function session(overrides: Partial<FocusSessionDoc> = {}): FocusSessionDoc {
  return {
    id: 's1',
    clientRequestId: 'req-s1',
    activity: 'homework',
    plannedSeconds: 1500,
    status: 'completed',
    startedAtUtc: T0,
    pauses: [],
    docVersion: 1,
    ...overrides,
  };
}

/** 无暂停的已完成会话：有效秒数恰好 = minutes*60，便于断言。 */
function completed(
  id: string,
  completedAtUtc: number,
  minutes: number,
  activity: ActivityType = 'homework',
): FocusSessionDoc {
  return session({
    id,
    clientRequestId: `req-${id}`,
    activity,
    plannedSeconds: minutes * 60,
    startedAtUtc: completedAtUtc - minutes * 60_000,
    status: 'completed',
    completedAtUtc,
  });
}

describe('focusRepository', () => {
  it('空存储 loadActive → null', async () => {
    const repo = createFocusRepository(memoryDriver());
    await expect(repo.loadActive()).resolves.toBeNull();
  });

  it('saveActive/loadActive 往返；clearActive 后回到 null', async () => {
    const driver = memoryDriver();
    const repo = createFocusRepository(driver);
    const doc = session({ id: 'live-1', status: 'active', plannedSeconds: 25 * 60 });
    await repo.saveActive(doc);
    await expect(repo.loadActive()).resolves.toEqual(doc);
    await repo.clearActive();
    await expect(repo.loadActive()).resolves.toBeNull();
    await expect(driver.get(FOCUS_ACTIVE_KEY)).resolves.toBeNull();
  });

  it('坏 JSON → null；docVersion ≠ 1 → null', async () => {
    const driver = memoryDriver();
    const repo = createFocusRepository(driver);
    await driver.set(FOCUS_ACTIVE_KEY, '{not-json');
    await expect(repo.loadActive()).resolves.toBeNull();
    await driver.set(
      FOCUS_ACTIVE_KEY,
      JSON.stringify({ ...session(), docVersion: 2 }),
    );
    await expect(repo.loadActive()).resolves.toBeNull();
  });

  it('appendHistory 追加顺序：新的在末尾；空/坏 JSON loadHistory → []', async () => {
    const driver = memoryDriver();
    const repo = createFocusRepository(driver);
    await expect(repo.loadHistory()).resolves.toEqual([]);

    const earlier = completed('h1', Date.UTC(2026, 7, 29, 4, 0, 0), 30, 'reading');
    const later = completed('h2', T0, 25, 'homework');
    await repo.appendHistory(earlier);
    await repo.appendHistory(later);
    await expect(repo.loadHistory()).resolves.toEqual([earlier, later]);

    await driver.set(FOCUS_HISTORY_KEY, ']]broken[[');
    await expect(repo.loadHistory()).resolves.toEqual([]);
  });
});

describe('summarize', () => {
  it('空历史 → 全 0，本周目标默认 300 分钟', () => {
    expect(summarize([], T0)).toEqual({
      todayMinutes: 0,
      todaySessions: 0,
      weekMinutes: 0,
      weekTargetMinutes: 300,
      streakDays: 0,
      byActivity: [],
    });
  });

  it('今日/昨日/更早分账：今日只算今天，本周只算周一 00:00 起；byActivity 降序', () => {
    const history = [
      completed('thu', Date.UTC(2026, 7, 27, 8, 0, 0), 45, 'coding'), // 周四 16:00
      completed('yesterday', Date.UTC(2026, 7, 29, 4, 0, 0), 30, 'reading'), // 周六 12:00
      completed('today', T0, 25, 'homework'), // 周日 10:00
    ];
    const summary = summarize(history, T0, { tzOffsetMinutes: OFFSET });
    expect(summary.todayMinutes).toBe(25);
    expect(summary.todaySessions).toBe(1);
    expect(summary.weekMinutes).toBe(100); // 45 + 30 + 25
    expect(summary.streakDays).toBe(2); // 周日 ✓ 周六 ✓ 周五 ✗
    expect(summary.byActivity).toEqual([
      { activity: 'coding', minutes: 45 },
      { activity: 'reading', minutes: 30 },
      { activity: 'homework', minutes: 25 },
    ]);
  });

  it('byActivity 仅统计本周，按分钟降序', () => {
    const history = [
      completed('in-week-a', Date.UTC(2026, 7, 28, 2, 0, 0), 30, 'coding'),
      completed('out-of-week', Date.UTC(2026, 7, 20, 2, 0, 0), 90, 'vocab'), // 上上周四
      completed('in-week-b', Date.UTC(2026, 7, 29, 2, 0, 0), 40, 'reading'),
    ];
    expect(summarize(history, T0, { tzOffsetMinutes: OFFSET }).byActivity).toEqual([
      { activity: 'reading', minutes: 40 },
      { activity: 'coding', minutes: 30 },
    ]);
  });

  it('周界：上周日不计；周一 00:00（含）起计入——23:59:59/00:00:00 边界', () => {
    const history = [
      // 上周日 2026-08-23 18:00 上海 → 属上周，不计
      completed('prev-sun', Date.UTC(2026, 7, 23, 10, 0, 0), 10, 'vocab'),
      // 上周日 23:59:59 上海 → 不计
      completed('edge-before', Date.UTC(2026, 7, 23, 15, 59, 59), 10, 'vocab'),
      // 周一 2026-08-24 00:00:00 上海 → 本周第一分钟，计入
      completed('edge-at', Date.UTC(2026, 7, 23, 16, 0, 0), 20, 'reading'),
      // 周一 2026-08-24 09:00 上海 → 计入
      completed('mon-am', Date.UTC(2026, 7, 24, 1, 0, 0), 30, 'coding'),
    ];
    const summary = summarize(history, T0, { tzOffsetMinutes: OFFSET });
    expect(summary.weekMinutes).toBe(50); // 20 + 30
    expect(summary.byActivity).toEqual([
      { activity: 'coding', minutes: 30 },
      { activity: 'reading', minutes: 20 },
    ]);
    expect(summary.todayMinutes).toBe(0);
    expect(summary.streakDays).toBe(0); // 今天、昨天均无完成
  });

  it('streak 跨午夜连日回数；同日多会话只算一天', () => {
    const history = [
      completed('fri', Date.UTC(2026, 7, 28, 4, 0, 0), 20, 'reading'),
      completed('sat-a', Date.UTC(2026, 7, 29, 2, 0, 0), 30, 'coding'),
      completed('sat-b', Date.UTC(2026, 7, 29, 8, 0, 0), 15, 'vocab'),
      completed('sun', T0, 25, 'homework'),
    ];
    expect(summarize(history, T0, { tzOffsetMinutes: OFFSET }).streakDays).toBe(3);
  });

  it('今天还没有完成但昨天有 → streak 从昨天起算；只有前天 → 0', () => {
    const yesterdayOnly = [
      completed('sat', Date.UTC(2026, 7, 29, 4, 0, 0), 20, 'reading'),
    ];
    const summary = summarize(yesterdayOnly, T0, { tzOffsetMinutes: OFFSET });
    expect(summary.todayMinutes).toBe(0);
    expect(summary.todaySessions).toBe(0);
    expect(summary.weekMinutes).toBe(20);
    expect(summary.streakDays).toBe(1);

    const dayBeforeOnly = [
      completed('fri', Date.UTC(2026, 7, 28, 4, 0, 0), 20, 'reading'),
    ];
    expect(summarize(dayBeforeOnly, T0, { tzOffsetMinutes: OFFSET }).streakDays).toBe(0);
  });

  it('tzOffsetMinutes 决定日界：同一时刻在 UTC+8 是今天、在 UTC 是昨天', () => {
    // 2026-08-29 16:30 UTC = 2026-08-30 00:30 上海（周日）；UTC 下仍是周六
    const history = [completed('midnight-crosser', Date.UTC(2026, 7, 29, 16, 30, 0), 30, 'reading')];

    const shanghai = summarize(history, T0, { tzOffsetMinutes: 480 });
    expect(shanghai.todaySessions).toBe(1);
    expect(shanghai.todayMinutes).toBe(30);
    expect(shanghai.streakDays).toBe(1);

    const utc = summarize(history, T0, { tzOffsetMinutes: 0 });
    expect(utc.todaySessions).toBe(0);
    expect(utc.todayMinutes).toBe(0);
    expect(utc.streakDays).toBe(1); // 昨天有 → 从昨天起算
  });

  it('weekTargetMinutes 可覆盖默认值', () => {
    const summary = summarize([], T0, { weekTargetMinutes: 600 });
    expect(summary.weekTargetMinutes).toBe(600);
  });

  it('放弃（abandoned）的会话不进统计', () => {
    const abandoned = session({
      id: 'quit',
      status: 'abandoned',
      startedAtUtc: T0 - 20 * 60_000,
      abandonedAtUtc: T0,
    });
    const history = [abandoned, completed('done', T0, 25, 'homework')];
    const summary = summarize(history, T0, { tzOffsetMinutes: OFFSET });
    expect(summary.todaySessions).toBe(1);
    expect(summary.todayMinutes).toBe(25);
    expect(summary.weekMinutes).toBe(25);
    expect(summary.streakDays).toBe(1);
    expect(summary.byActivity).toEqual([{ activity: 'homework', minutes: 25 }]);
  });
});

describe('achievementRepository', () => {
  const firstFocus = ACHIEVEMENT_DEFS[0]; // first_focus → bookmark
  const streak7 = ACHIEVEMENT_DEFS[1]; // streak_7 → lamp

  it('空存储 → loadGranted/loadRoomItems 返回空数组', async () => {
    const repo = createAchievementRepository(memoryDriver());
    await expect(repo.loadGranted()).resolves.toEqual([]);
    await expect(repo.loadRoomItems()).resolves.toEqual([]);
  });

  it('recordGrant 记录 ruleKey/时间/来源会话/ruleVersion', async () => {
    const repo = createAchievementRepository(memoryDriver());
    await expect(
      repo.recordGrant(firstFocus.ruleKey, firstFocus, 'sess-1', T0),
    ).resolves.toBe(true);
    await expect(repo.loadGranted()).resolves.toEqual([
      {
        ruleKey: 'first_focus',
        grantedAtUtc: T0,
        sourceSessionId: 'sess-1',
        ruleVersion: 1,
      },
    ]);
  });

  it('重复授予同一 ruleKey 幂等：不追加、不覆盖时间与来源', async () => {
    const repo = createAchievementRepository(memoryDriver());
    await repo.recordGrant(firstFocus.ruleKey, firstFocus, 'sess-1', T0);
    await expect(
      repo.recordGrant(firstFocus.ruleKey, firstFocus, 'sess-2', T0 + 1000),
    ).resolves.toBe(false);
    const granted = await repo.loadGranted();
    expect(granted).toHaveLength(1);
    expect(granted[0]).toEqual({
      ruleKey: 'first_focus',
      grantedAtUtc: T0,
      sourceSessionId: 'sess-1',
      ruleVersion: 1,
    });
  });

  it('无 sourceSessionId 时省略该字段', async () => {
    const repo = createAchievementRepository(memoryDriver());
    await repo.recordGrant(firstFocus.ruleKey, firstFocus, undefined, T0);
    expect(await repo.loadGranted()).toEqual([
      { ruleKey: 'first_focus', grantedAtUtc: T0, ruleVersion: 1 },
    ]);
  });

  it('recordRoomItem 解锁收藏物；同一 itemId 幂等；不同成就追加', async () => {
    const repo = createAchievementRepository(memoryDriver());
    await expect(repo.recordRoomItem(firstFocus, T0 + 5)).resolves.toBe(true);
    await expect(repo.recordRoomItem(firstFocus, T0 + 9)).resolves.toBe(false); // bookmark 已有
    await expect(repo.recordRoomItem(streak7, T0 + 10)).resolves.toBe(true);
    await expect(repo.loadRoomItems()).resolves.toEqual([
      { itemId: 'bookmark', unlockedAtUtc: T0 + 5, sourceRuleKey: 'first_focus' },
      { itemId: 'lamp', unlockedAtUtc: T0 + 10, sourceRuleKey: 'streak_7' },
    ]);
  });
});

describe('skinSelectionRepository', () => {
  it('默认 null；select 后可读回；重选覆盖', async () => {
    const repo = createSkinSelectionRepository(memoryDriver());
    await expect(repo.loadSelected()).resolves.toBeNull();
    await repo.select('rainy-study-room-v1', T0);
    await expect(repo.loadSelected()).resolves.toEqual({
      skinId: 'rainy-study-room-v1',
      selectedAtUtc: T0,
    });
    await repo.select('rainy-study-room-v1', T0 + DAY);
    await expect(repo.loadSelected()).resolves.toEqual({
      skinId: 'rainy-study-room-v1',
      selectedAtUtc: T0 + DAY,
    });
  });
});
