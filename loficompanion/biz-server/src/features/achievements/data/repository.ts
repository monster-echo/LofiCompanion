import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { getDb } from '../../../db';

// 成就数据访问（Prisma 搬迁自 loficompanion/server achievements/service）。
// 成就只由服务端根据有效会话与规则版本发放；UNIQUE(user_id, rule_key,
// rule_version) / UNIQUE(user_id, room_item_id) 兜底并发与重放；调用方负责
// 把 grantNewlyEarnedForSession 放进与结算相同的数据库事务。

import {
  ACHIEVEMENT_DEFS,
  evaluateGrants,
  rewardFor,
  type AchievementDef,
  type AchievementRuleKey,
  type RoomItemId,
} from '../domain/rules';

export type { AchievementDef, AchievementRuleKey, RoomItemId };

// 收藏物目录种子（与 server/database-schema-lofi.ts ROOM_ITEM_SEEDS 一致）
const ROOM_ITEM_SEEDS = [
  { itemId: 'bookmark', name: '雨夜书签', sourceRuleKey: 'first_focus' },
  { itemId: 'lamp', name: '小台灯', sourceRuleKey: 'streak_7' },
  { itemId: 'plant', name: '绿植', sourceRuleKey: 'rainy_10h' },
  { itemId: 'group_photo', name: '自习伙伴合影', sourceRuleKey: 'sessions_100' },
  { itemId: 'weekly_group_photo', name: '周目标合影', sourceRuleKey: 'weekly_settlement' },
] as const;

let roomItemsSeeded = false;

/** 幂等收藏物目录种子：首次发放/查询前确保 room_items 就位。 */
export async function ensureRoomItemSeed(): Promise<void> {
  if (roomItemsSeeded) return;
  const db = getDb();
  for (const item of ROOM_ITEM_SEEDS) {
    const existing = await db.roomItem.findUnique({ where: { item_id: item.itemId } });
    if (!existing) {
      await db.roomItem.create({
        data: {
          id: `room-item-${item.itemId}`,
          item_id: item.itemId,
          name: item.name,
          source_rule_key: item.sourceRuleKey,
        },
      }).catch(() => undefined); // 并发下已建：忽略
    }
  }
  roomItemsSeeded = true;
}

interface CompletedRow {
  effective_seconds: number;
  ended_at: string | null;
}

async function loadHistory(userId: string): Promise<CompletedRow[]> {
  return await getDb().focusSession.findMany({
    where: { user_id: userId, status: 'completed' },
    select: { effective_seconds: true, ended_at: true },
  });
}

async function loadGranted(userId: string): Promise<AchievementRuleKey[]> {
  const rows = await getDb().achievementGrant.findMany({
    where: { user_id: userId, rule_version: 1 },
    select: { rule_key: true },
  });
  return rows.map((row) => row.rule_key as AchievementRuleKey);
}

/**
 * 会话结算事务内调用（tx 为 prisma 事务客户端）：评估 → 发放 → 房间收藏物入库。
 * 迁移自 grantNewlyEarnedForSession；调放方负责事务。
 */
export async function grantNewlyEarnedInTx(
  tx: PrismaTransaction,
  userId: string,
  sourceSessionId: string | null,
): Promise<Array<{ ruleKey: AchievementRuleKey; rewardItemId: RoomItemId }>> {
  await ensureRoomItemSeed();
  const history = await tx.focusSession.findMany({
    where: { user_id: userId, status: 'completed' },
    select: { effective_seconds: true, ended_at: true },
  });
  const grantedRows = await tx.achievementGrant.findMany({
    where: { user_id: userId, rule_version: 1 },
    select: { rule_key: true },
  });
  const already = grantedRows.map((row) => row.rule_key as AchievementRuleKey);
  const toGrant = evaluateGrants(history, already);
  const granted: Array<{ ruleKey: AchievementRuleKey; rewardItemId: RoomItemId }> = [];
  const now = new Date().toISOString();
  for (const ruleKey of toGrant) {
    const def = ACHIEVEMENT_DEFS.find((candidate) => candidate.ruleKey === ruleKey)!;
    const grantId = randomUUID();
    await tx.achievementGrant.createMany({
      data: [{
        id: grantId,
        user_id: userId,
        rule_key: ruleKey,
        rule_version: 1,
        source_session_id: sourceSessionId,
        granted_at: now,
      }],
      skipDuplicates: true,
    });
    // 收藏物按 item_id 定位目录行；UNIQUE(user_id, room_item_id) 幂等
    const reward = await tx.roomItem.findUnique({ where: { item_id: def.rewardItemId } });
    if (reward) {
      await tx.userRoomItem.createMany({
        data: [{
          user_id: userId,
          room_item_id: reward.id,
          source_grant_id: grantId,
          unlocked_at: now,
        }],
        skipDuplicates: true,
      });
    }
    granted.push({ ruleKey, rewardItemId: rewardFor(ruleKey) });
  }
  return granted;
}

export async function listAchievementsForUser(userId: string) {
  await ensureRoomItemSeed();
  const granted = await getDb().achievementGrant.findMany({
    where: { user_id: userId, rule_version: 1 },
  });
  const grantedByKey = new Map(granted.map((row) => [row.rule_key, row]));
  return ACHIEVEMENT_DEFS.map((def: AchievementDef) => ({
    ...def,
    grantedAt: grantedByKey.get(def.ruleKey)?.granted_at ?? null,
    sourceSessionId: grantedByKey.get(def.ruleKey)?.source_session_id ?? null,
  }));
}

export async function listRoomItemsForUser(userId: string) {
  await ensureRoomItemSeed();
  const db = getDb();
  const unlocked = await db.userRoomItem.findMany({
    where: { user_id: userId },
    orderBy: { unlocked_at: 'asc' },
  });
  const items = await db.roomItem.findMany();
  const byId = new Map(items.map((item) => [item.id, item]));
  return unlocked
    .map((row) => {
      const item = byId.get(row.room_item_id);
      return item ? {
        item_id: item.item_id as RoomItemId,
        name: item.name,
        source_rule_key: item.source_rule_key,
        unlocked_at: row.unlocked_at,
      } : null;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}

// 事务客户端类型（prisma $transaction 回调入参）
export type PrismaTransaction = Prisma.TransactionClient;
