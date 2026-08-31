import { ApiError } from '@/lib/http';
import { getDb } from '@/db';
import { isWeekOver } from '../domain/settlement';
import {
  assertWeekId, currentWeekId, finalizeView, rankFromScores, readSnapshot,
  settleScope, writeSnapshot,
  type LeaderboardScoreRow, type LeaderboardView, type RankingEntry,
} from './score-repository';
import { assertGroupMember, getGroupMemberIds } from './group-service';

// 小组周榜结算与周结算收藏物（docs/01 §5.7、P0-C Task 3）：
// - 组周目标 = weekly_goal_minutes；组有效分钟 = Σ 成员（每日 180 分钟裁剪后）；
// - 周结束后首次查询：惰性结算 + 写组共享不可变快照（信封含 goalMet/groupTotalSeconds）；
//   仅当快照「本次新建」且目标达成时，向当时在组的每位成员发放 weekly_group_photo
//   房间收藏物（user_room_items UNIQUE(user_id, room_item_id) 幂等；source_grant_id
//   为 NULL——非成就来源，来源语义记 source_rule_key='weekly_settlement'）。
//   P0 取舍：UNIQUE 键不含周 → 每用户一生一次；后续周达标不再重复发放。
// - 本周未结束：live 结算展示进度，不发收藏物、不写快照。

export const WEEKLY_GROUP_PHOTO_ITEM_ID = 'weekly_group_photo';

export interface GroupWeeklyOutcome {
  weekId: string;
  isWeekOver: boolean;
  /** 本次查询是否命中/新写了快照（本周未结束恒 false） */
  snapshotUsed: boolean;
  weeklyGoalMinutes: number;
  goalMet: boolean;
  groupTotalSeconds: number;
  rankings: RankingEntry[];
}

function outcomeOf(
  rows: ReadonlyArray<LeaderboardScoreRow>,
  weeklyGoalMinutes: number,
): { goalMet: boolean; groupTotalSeconds: number } {
  const groupTotalSeconds = rows.reduce((sum, row) => sum + row.effective_seconds, 0);
  return { goalMet: groupTotalSeconds >= weeklyGoalMinutes * 60, groupTotalSeconds };
}

async function groupGoalMinutes(groupId: string): Promise<number> {
  const row = await getDb().studyGroup.findUnique({
    where: { id: groupId },
    select: { weekly_goal_minutes: true },
  });
  if (!row) throw new ApiError(404, 'GROUP_NOT_FOUND', '小组不存在');
  return row.weekly_goal_minutes;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** 周目标达成发放：每位成员至多一行（UNIQUE 幂等，历史已得不再发）。 */
async function grantWeeklyGroupPhoto(memberIds: ReadonlyArray<string>): Promise<number> {
  const roomItem = await getDb().roomItem.findUnique({
    where: { item_id: WEEKLY_GROUP_PHOTO_ITEM_ID },
    select: { id: true },
  });
  if (!roomItem) return 0; // 防御：种子未生效时不发
  let granted = 0;
  for (const userId of memberIds) {
    const result = await getDb().userRoomItem.createMany({
      data: [{ user_id: userId, room_item_id: roomItem.id, source_grant_id: null, unlocked_at: nowIso() }],
      skipDuplicates: true,
    });
    granted += result.count;
  }
  return granted;
}

/** 组周结算：成员逐一结算（复用榜单机制）→ 组总分钟 → 目标判定；周末后
 *  惰性快照，且仅快照新建且达标时发放收藏物（重放永不重复发放）。 */
export async function settleGroupWeek(
  groupId: string,
  weekId: string,
  nowMs: number = Date.now(),
): Promise<GroupWeeklyOutcome> {
  assertWeekId(weekId);
  const weeklyGoalMinutes = await groupGoalMinutes(groupId);
  const memberIds = await getGroupMemberIds(groupId);
  const weekOver = isWeekOver(weekId, nowMs);
  if (weekOver) {
    const existing = await readSnapshot('group', groupId, weekId);
    if (existing) {
      // 快照不可变：判定以固化结果为准，重放不再发放。
      return {
        weekId, isWeekOver: true, snapshotUsed: true, weeklyGoalMinutes,
        goalMet: existing.goalMet ?? false,
        groupTotalSeconds: existing.groupTotalSeconds ?? 0,
        rankings: existing.rankings,
      };
    }
    const rows = await settleScope('group', groupId, memberIds, weekId);
    const rankings = await rankFromScores(rows);
    const { goalMet, groupTotalSeconds } = outcomeOf(rows, weeklyGoalMinutes);
    const newlyCreated = await writeSnapshot('group', groupId, weekId, {
      rankings, goalMet, groupTotalSeconds,
    });
    if (newlyCreated && goalMet) {
      await grantWeeklyGroupPhoto(memberIds);
    }
    return { weekId, isWeekOver: true, snapshotUsed: true, weeklyGoalMinutes, goalMet, groupTotalSeconds, rankings };
  }
  // 本周未结束：live 进度（结算与好友榜同口径），不写快照、不发收藏物。
  const rows = await settleScope('group', groupId, memberIds, weekId);
  const rankings = await rankFromScores(rows);
  const { goalMet, groupTotalSeconds } = outcomeOf(rows, weeklyGoalMinutes);
  return {
    weekId, isWeekOver: false, snapshotUsed: false, weeklyGoalMinutes,
    goalMet, groupTotalSeconds, rankings,
  };
}

export interface GroupLeaderboardView extends LeaderboardView {
  weeklyGoalMinutes: number;
  goalMet: boolean;
  groupTotalSeconds: number;
}

/** 组周榜视图（S11/S13）：仅成员可见（403 GROUP_FORBIDDEN），共同目标卡数据齐备。 */
export async function getGroupWeeklyView(
  groupId: string,
  viewerId: string,
  weekId: string = currentWeekId(),
  nowMs: number = Date.now(),
): Promise<GroupLeaderboardView> {
  assertWeekId(weekId);
  await assertGroupMember(groupId, viewerId);
  const outcome = await settleGroupWeek(groupId, weekId, nowMs);
  const view = await finalizeView(
    viewerId, weekId, outcome.isWeekOver, outcome.snapshotUsed, outcome.rankings,
  );
  return {
    ...view,
    weeklyGoalMinutes: outcome.weeklyGoalMinutes,
    goalMet: outcome.goalMet,
    groupTotalSeconds: outcome.groupTotalSeconds,
  };
}
