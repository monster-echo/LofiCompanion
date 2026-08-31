import React, { useEffect, useState } from 'react';
import {
  Image, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { apiClient } from '../../../data/apiClient';
import type {
  GroupLeaderboardViewRemote, LeaderboardRankingRemote,
} from '../../../data/apiClient';
import { readMyGroup, saveMyGroup, type MyGroupRef } from '../../../data/storage';
import { AppIcon } from '../../../design-system/AppIcon';
import {
  achievementBorder, achievementSoft, rankAccentColors, rankAccentSoft,
} from '../../../design-system/derivedTokens';
import { useApp } from '../../../state/AppStore';
import { colors, radii, semantic, space, type } from '../../../theme/tokens';
import { useAsyncRefresh } from '../application/useAsyncRefresh';
import { avatarInitial, goalProgress, rankAccent } from '../domain/model';
import { LEADERBOARD_STRINGS as STR } from './strings';

/**
 * S10 学习排行榜（doc-08 §11，P0-C 真实榜单，登录态 Tab 根页；未登录走
 * LeaderboardSignInScreen）。分段「好友 / 小组」（本周为固定上下文）；
 * 行高 76（名次圆片 40、头像 44、分钟右对齐 tabular）；当前用户卡固定在
 * 列表底部可见区（achievement 低透明边框）；数据只含昵称/头像/分钟/名次。
 */
type Segment = 'friends' | 'group';

export function LeaderboardHomeScreen() {
  const { user, navigate, showToast } = useApp();
  const [segment, setSegment] = useState<Segment>('friends');
  // undefined = 本地引用读取中；null = 未加入（显示建组/加入入口）
  const [myGroup, setMyGroup] = useState<MyGroupRef | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    readMyGroup().then((ref) => {
      if (alive) setMyGroup(ref);
    });
    return () => {
      alive = false;
    };
  }, []);

  const friends = useAsyncRefresh(() => apiClient.friendsLeaderboard(), []);
  const group = useAsyncRefresh(
    () => (myGroup
      ? apiClient.groupLeaderboard(myGroup.groupId)
      : Promise.resolve(null)),
    [myGroup],
  );

  const friendsView = friends.state.status === 'ready' ? friends.state.data : null;
  const rankings = friendsView?.rankings ?? [];
  const self = rankings.find((entry) => entry.userId === user?.id) ?? null;
  const others = rankings.filter((entry) => entry.userId !== user?.id);
  const noFriends = rankings.length <= 1;

  // 无好友空态才需要邀请码入口（延迟取码，避免每次进屏都 POST）
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  useEffect(() => {
    if (!noFriends || inviteCode) return;
    let alive = true;
    apiClient.myInviteCode()
      .then(({ code }) => {
        if (alive) setInviteCode(code);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [noFriends, inviteCode]);

  const refresh = () => {
    friends.refresh();
    if (segment === 'group') group.refresh();
  };
  const reloadActive = () => (segment === 'friends' ? friends.reload() : group.reload());
  const refreshing = friends.refreshing || group.refreshing;

  const shareCode = (code: string, label: string) => {
    void Share.share({ message: `${label}：${code}（在 LofiCompanion 输入即可加入）` });
  };

  // —— 好友邀请码兑入 ——
  const [inviteInput, setInviteInput] = useState('');
  const [acceptBusy, setAcceptBusy] = useState(false);
  const acceptInvite = async () => {
    const code = inviteInput.trim();
    if (!code || acceptBusy) return;
    setAcceptBusy(true);
    try {
      const result = await apiClient.acceptInvite(code);
      setInviteInput('');
      showToast(STR.acceptSuccess(result.friend.nickname), 'success');
      await friends.reload();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '添加失败', 'error');
    } finally {
      setAcceptBusy(false);
    }
  };

  // —— 建组 / 入组（成功后记录本地小组引用并刷新组榜）——
  const [groupName, setGroupName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [groupBusy, setGroupBusy] = useState(false);
  const adoptGroup = async (groupSummary: { id: string; name: string }, message: string) => {
    const ref = { groupId: groupSummary.id, groupName: groupSummary.name };
    await saveMyGroup(ref);
    setMyGroup(ref);
    showToast(message, 'success');
  };
  const createGroup = async () => {
    const name = groupName.trim();
    if (!name || groupBusy) {
      if (!name) showToast('先给小组起个名字', 'info');
      return;
    }
    setGroupBusy(true);
    try {
      const { group: created } = await apiClient.createGroup(name);
      setGroupName('');
      await adoptGroup(created, STR.groupCreated(created.name));
    } catch (error) {
      showToast(error instanceof Error ? error.message : '创建失败', 'error');
    } finally {
      setGroupBusy(false);
    }
  };
  const joinGroupByCode = async () => {
    const code = joinCode.trim();
    if (!code || groupBusy) {
      if (!code) showToast('输入小组加入码', 'info');
      return;
    }
    setGroupBusy(true);
    try {
      const { group: joined } = await apiClient.joinGroup(code);
      setJoinCode('');
      await adoptGroup(joined, STR.groupJoined(joined.name));
    } catch (error) {
      showToast(error instanceof Error ? error.message : '加入失败', 'error');
    } finally {
      setGroupBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerSlot} />
        <Text style={styles.headerTitle}>{STR.screenTitle}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={STR.helpLabel}
          onPress={() => navigate('leaderboard.rules')}
          style={({ pressed }) => [styles.helpButton, pressed && styles.pressed]}
        >
          <AppIcon name="help" color={semantic.textSecondary} size={22} />
        </Pressable>
      </View>
      <Text style={styles.weekCaption}>
        {STR.weekContext(friendsView?.weekId ?? '')}
      </Text>

      {/* 分段控件「好友 / 小组」，高 40（doc-08 §11） */}
      <View style={styles.segment}>
        <SegmentButton
          label={STR.segmentFriends}
          active={segment === 'friends'}
          onPress={() => setSegment('friends')}
        />
        <SegmentButton
          label={STR.segmentGroup}
          active={segment === 'group'}
          onPress={() => setSegment('group')}
        />
      </View>

      {/* 规则提示行，高 32：锁图标 + 仅展示完成的专注 */}
      <View style={styles.hintRow}>
        <AppIcon name="lock" color={semantic.textMuted} size={14} />
        <Text style={styles.hintText}>{STR.hintCompletedOnly}</Text>
      </View>

      <View style={styles.listArea}>
        {segment === 'friends' ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={(
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refresh}
                tintColor={semantic.textSecondary}
              />
            )}
          >
            {friends.state.status === 'loading' ? <LoadingHint /> : null}
            {friends.state.status === 'error' ? (
              <ErrorState message={friends.state.message} onRetry={friends.reload} />
            ) : null}
            {friends.state.status === 'ready' && noFriends ? (
              <InviteEntry
                inviteCode={inviteCode}
                inviteInput={inviteInput}
                acceptBusy={acceptBusy}
                onInviteInputChange={setInviteInput}
                onAcceptInvite={() => void acceptInvite()}
                onShareCode={(code) => shareCode(code, STR.myInviteCode)}
              />
            ) : null}
            {friends.state.status === 'ready' && !noFriends
              ? others.map((entry) => <RankRow key={entry.userId} entry={entry} />)
              : null}
          </ScrollView>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={(
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refresh}
                tintColor={semantic.textSecondary}
              />
            )}
          >
            {myGroup === undefined || group.state.status === 'loading' ? <LoadingHint /> : null}
            {group.state.status === 'error' ? (
              <GroupErrorState
                message={group.state.message}
                code={group.state.code}
                onRetry={group.reload}
                onClearRef={() => {
                  void saveMyGroup(null);
                  setMyGroup(null);
                }}
              />
            ) : null}
            {group.state.status === 'ready' && myGroup && group.state.data ? (
              <GroupBoard
                myGroup={myGroup}
                view={group.state.data}
                onViewGroup={() => navigate('groups.detail', { groupId: myGroup.groupId })}
              />
            ) : null}
            {group.state.status === 'ready' && myGroup === null ? (
              <NoGroupEntry
                groupName={groupName}
                joinCode={joinCode}
                busy={groupBusy}
                onGroupNameChange={setGroupName}
                onJoinCodeChange={setJoinCode}
                onCreateGroup={() => void createGroup()}
                onJoinGroup={() => void joinGroupByCode()}
              />
            ) : null}
          </ScrollView>
        )}

        {/* 当前用户卡固定在列表底部可见区（self row 永在——服务端 finalizeView 保证） */}
        {segment === 'friends' && self ? (
          <SelfCard entry={self} onRules={() => navigate('leaderboard.rules')} />
        ) : null}
      </View>

    </View>
  );
}

function SegmentButton({ label, active, onPress }: Readonly<{
  label: string;
  active: boolean;
  onPress: () => void;
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.segmentItem,
        active && styles.segmentItemActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

/** 榜单行：高 76 = 名次区 40 + 头像 44 + 昵称 + 分钟右对齐 tabular */
function RankRow({ entry }: Readonly<{ entry: LeaderboardRankingRemote }>) {
  const accent = rankAccent(entry.rank);
  return (
    <View style={styles.row}>
      <View style={styles.rankArea}>
        {accent ? (
          <View
            style={[
              styles.rankChip,
              { borderColor: rankAccentColors[accent], backgroundColor: rankAccentSoft[accent] },
            ]}
          >
            <Text style={[styles.rankChipText, { color: rankAccentColors[accent] }]}>
              {entry.rank}
            </Text>
          </View>
        ) : (
          <Text style={styles.rankPlain}>{entry.rank}</Text>
        )}
      </View>
      {entry.avatarUrl ? (
        <Image source={{ uri: entry.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarInitial}>{avatarInitial(entry.nickname)}</Text>
        </View>
      )}
      <Text style={styles.nickname} numberOfLines={1}>{entry.nickname}</Text>
      <Text style={styles.minutes}>{STR.minutesValue(entry.minutes)}</Text>
    </View>
  );
}

function SelfCard({ entry, onRules }: Readonly<{
  entry: LeaderboardRankingRemote;
  onRules: () => void;
}>) {
  return (
    <View style={[styles.selfCard, entry.youOptedOut && styles.selfCardOptedOut]}>
      <View style={styles.selfLeft}>
        {entry.avatarUrl ? (
          <Image source={{ uri: entry.avatarUrl }} style={styles.selfAvatar} />
        ) : (
          <View style={[styles.selfAvatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>{avatarInitial(entry.nickname)}</Text>
          </View>
        )}
        <View style={styles.selfMeta}>
          <View style={styles.selfNameRow}>
            <Text style={styles.selfName} numberOfLines={1}>{entry.nickname}</Text>
            <Text style={styles.meBadge}>{STR.meBadge}</Text>
            <Text style={styles.selfRank}>{STR.currentRankValue(entry.rank)}</Text>
          </View>
          {entry.youOptedOut ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={STR.youOptedOutHint}
              onPress={onRules}
              style={({ pressed }) => [styles.optedRow, pressed && styles.pressed]}
            >
              <Text style={styles.optedText}>{STR.youOptedOutHint}</Text>
              <Text style={styles.optedAction}>{STR.youOptedOutAction}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <Text style={styles.selfMinutes}>{STR.minutesValue(entry.minutes)}</Text>
    </View>
  );
}

function InviteEntry({ inviteCode, inviteInput, acceptBusy, onInviteInputChange, onAcceptInvite, onShareCode }: Readonly<{
  inviteCode: string | null;
  inviteInput: string;
  acceptBusy: boolean;
  onInviteInputChange: (value: string) => void;
  onAcceptInvite: () => void;
  onShareCode: (code: string) => void;
}>) {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyHead}>
        <Text style={styles.emptyTitle}>{STR.emptyFriendsTitle}</Text>
        <Text style={styles.emptyHint}>{STR.emptyFriendsHint}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{STR.myInviteCode}</Text>
        <Text selectable style={styles.inviteCode}>{inviteCode ?? '········'}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={STR.copyInvite}
          disabled={!inviteCode}
          onPress={() => inviteCode && onShareCode(inviteCode)}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryButtonText}>{STR.copyInvite}</Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{STR.inviteInputLabel}</Text>
        <View style={styles.acceptRow}>
          <TextInput
            accessibilityLabel={STR.inviteInputLabel}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            onChangeText={onInviteInputChange}
            placeholder={STR.inviteInputPlaceholder}
            placeholderTextColor={semantic.textMuted}
            style={styles.input}
            value={inviteInput}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={STR.acceptInvite}
            disabled={acceptBusy || inviteInput.trim() === ''}
            onPress={onAcceptInvite}
            style={({ pressed }) => [
              styles.acceptButton,
              (acceptBusy || inviteInput.trim() === '') && styles.buttonDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.acceptButtonText}>{STR.acceptInvite}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function NoGroupEntry({ groupName, joinCode, busy, onGroupNameChange, onJoinCodeChange, onCreateGroup, onJoinGroup }: Readonly<{
  groupName: string;
  joinCode: string;
  busy: boolean;
  onGroupNameChange: (value: string) => void;
  onJoinCodeChange: (value: string) => void;
  onCreateGroup: () => void;
  onJoinGroup: () => void;
}>) {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyHead}>
        <Text style={styles.emptyTitle}>{STR.noGroupTitle}</Text>
        <Text style={styles.emptyHint}>{STR.noGroupHint}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{STR.createGroupLabel}</Text>
        <TextInput
          accessibilityLabel={STR.createGroupLabel}
          maxLength={24}
          onChangeText={onGroupNameChange}
          placeholder={STR.createGroupNamePlaceholder}
          placeholderTextColor={semantic.textMuted}
          style={styles.input}
          value={groupName}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={STR.createGroupAction}
          disabled={busy}
          onPress={onCreateGroup}
          style={({ pressed }) => [styles.primaryButton, busy && styles.buttonDisabled, pressed && styles.pressed]}
        >
          <Text style={styles.primaryButtonText}>{STR.createGroupAction}</Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{STR.joinGroupLabel}</Text>
        <View style={styles.acceptRow}>
          <TextInput
            accessibilityLabel={STR.joinGroupAction}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            onChangeText={onJoinCodeChange}
            placeholder={STR.joinGroupPlaceholder}
            placeholderTextColor={semantic.textMuted}
            style={styles.input}
            value={joinCode}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={STR.joinGroupAction}
            disabled={busy || joinCode.trim() === ''}
            onPress={onJoinGroup}
            style={({ pressed }) => [
              styles.acceptButton,
              (busy || joinCode.trim() === '') && styles.buttonDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.acceptButtonText}>{STR.joinGroupAction}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** 小组分段：组名 + 周目标进度条 + 查看小组 + 组员榜 */
function GroupBoard({ myGroup, view, onViewGroup }: Readonly<{
  myGroup: MyGroupRef;
  view: GroupLeaderboardViewRemote;
  onViewGroup: () => void;
}>) {
  const ratio = goalProgress(Math.floor(view.groupTotalSeconds / 60), view.weeklyGoalMinutes);
  return (
    <View>
      <View style={styles.card}>
        <View style={styles.groupHeadRow}>
          <AppIcon name="group" color={semantic.actionPrimary} size={20} />
          <Text style={styles.groupName} numberOfLines={1}>{myGroup.groupName}</Text>
          {view.goalMet ? <Text style={styles.goalMetBadge}>{STR.goalMetBadge}</Text> : null}
        </View>
        <Text style={styles.groupGoalText}>
          {STR.groupGoal(Math.floor(view.groupTotalSeconds / 60), view.weeklyGoalMinutes)}
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(ratio * 100)}%` }]} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={STR.viewGroup}
          onPress={onViewGroup}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryButtonText}>{STR.viewGroup}</Text>
        </Pressable>
      </View>
      {view.rankings.map((entry) => <RankRow key={entry.userId} entry={entry} />)}
    </View>
  );
}

function LoadingHint() {
  return (
    <View style={styles.stateWrap}>
      <Text style={styles.stateText}>正在加载…</Text>
    </View>
  );
}

function ErrorState({ message, onRetry }: Readonly<{ message: string; onRetry: () => void }>) {
  return (
    <View style={styles.stateWrap}>
      <Text style={styles.stateTitle}>{STR.loadFailed}</Text>
      <Text style={styles.stateText}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={STR.retryAction}
        onPress={onRetry}
        style={({ pressed }) => [styles.secondaryButton, styles.stateRetry, pressed && styles.pressed]}
      >
        <Text style={styles.secondaryButtonText}>{STR.retryAction}</Text>
      </Pressable>
    </View>
  );
}

/** 组榜失败：403/404 时本地小组引用已失效，提供清除重建入口 */
function GroupErrorState({ message, code, onRetry, onClearRef }: Readonly<{
  message: string;
  code: string | null;
  onRetry: () => void;
  onClearRef: () => void;
}>) {
  const stale = code === 'GROUP_FORBIDDEN' || code === 'GROUP_NOT_FOUND';
  return (
    <View style={styles.stateWrap}>
      <Text style={styles.stateText}>{stale ? STR.groupUnavailable : message}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={STR.retryAction}
        onPress={onRetry}
        style={({ pressed }) => [styles.secondaryButton, styles.stateRetry, pressed && styles.pressed]}
      >
        <Text style={styles.secondaryButtonText}>{STR.retryAction}</Text>
      </Pressable>
      {stale ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={STR.clearGroupRef}
          onPress={onClearRef}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryButtonText}>{STR.clearGroupRef}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.canvas,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space.x4,
    paddingRight: space.x2,
  },
  headerSlot: {
    width: 44,
  },
  headerTitle: {
    ...type.title2,
    color: semantic.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  helpButton: {
    width: 44,
    height: 44,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekCaption: {
    ...type.caption,
    color: semantic.textMuted,
    textAlign: 'center',
    marginBottom: space.x2,
  },
  segment: {
    height: 40,
    marginHorizontal: space.x4,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: semantic.borderStandard,
    backgroundColor: semantic.surface,
    flexDirection: 'row',
    padding: 2,
    gap: 2,
  },
  segmentItem: {
    flex: 1,
    borderRadius: radii.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentItemActive: {
    backgroundColor: colors.brandSoft,
  },
  segmentText: {
    ...type.label,
    color: semantic.textMuted,
  },
  segmentTextActive: {
    color: semantic.actionPrimary,
  },
  hintRow: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.x2,
  },
  hintText: {
    ...type.caption,
    color: semantic.textMuted,
  },
  listArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: space.x4,
    paddingBottom: 120, // 当前用户卡（固定底部）不遮末行
    gap: space.x1,
  },
  row: {
    height: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
  },
  rankArea: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankChip: {
    width: 40,
    height: 40,
    borderRadius: radii.round,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankChipText: {
    ...type.bodyStrong,
    fontVariant: ['tabular-nums'],
  },
  rankPlain: {
    ...type.body,
    color: semantic.textMuted,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radii.round,
  },
  avatarFallback: {
    backgroundColor: semantic.surfaceRaised,
    borderWidth: 1,
    borderColor: semantic.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    ...type.bodyStrong,
    color: semantic.textSecondary,
  },
  nickname: {
    ...type.body,
    color: semantic.textPrimary,
    flex: 1,
  },
  minutes: {
    ...type.body,
    color: semantic.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  selfCard: {
    position: 'absolute',
    left: space.x4,
    right: space.x4,
    bottom: space.x3,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: achievementBorder,
    backgroundColor: achievementSoft,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2,
    gap: space.x3,
  },
  selfCardOptedOut: {
    backgroundColor: semantic.surface,
    borderColor: semantic.borderStandard,
  },
  selfLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
  },
  selfAvatar: {
    width: 36,
    height: 36,
    borderRadius: radii.round,
  },
  selfMeta: {
    flex: 1,
    gap: 2,
  },
  selfNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2,
  },
  selfName: {
    ...type.bodyStrong,
    color: semantic.textPrimary,
    flexShrink: 1,
    maxWidth: 120,
  },
  meBadge: {
    ...type.micro,
    color: semantic.actionPrimary,
    backgroundColor: colors.brandSoft,
    borderRadius: radii.small,
    paddingHorizontal: space.x1,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  selfRank: {
    ...type.caption,
    color: semantic.textMuted,
    fontVariant: ['tabular-nums'],
  },
  optedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2,
  },
  optedText: {
    ...type.caption,
    color: colors.warning,
  },
  optedAction: {
    ...type.caption,
    color: semantic.actionPrimary,
    textDecorationLine: 'underline',
  },
  selfMinutes: {
    ...type.bodyStrong,
    color: semantic.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  emptyWrap: {
    gap: space.x4,
    paddingTop: space.x5,
  },
  emptyHead: {
    alignItems: 'center',
    gap: space.x1,
  },
  emptyTitle: {
    ...type.title3,
    color: semantic.textPrimary,
    textAlign: 'center',
  },
  emptyHint: {
    ...type.caption,
    color: semantic.textMuted,
    textAlign: 'center',
  },
  card: {
    backgroundColor: semantic.surface,
    borderWidth: 1,
    borderColor: semantic.borderSoft,
    borderRadius: radii.card,
    padding: space.x4,
    gap: space.x3,
  },
  cardLabel: {
    ...type.label,
    color: semantic.textSecondary,
  },
  inviteCode: {
    ...type.displayMetric,
    color: semantic.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: 4,
    textAlign: 'center',
  },
  input: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: semantic.borderStandard,
    borderRadius: radii.control,
    backgroundColor: semantic.surfaceInset,
    paddingHorizontal: space.x3,
    color: semantic.textPrimary,
    ...type.body,
  },
  acceptRow: {
    flexDirection: 'row',
    gap: space.x2,
  },
  acceptButton: {
    minWidth: 72,
    minHeight: 48,
    borderRadius: radii.control,
    backgroundColor: semantic.actionPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.x3,
  },
  acceptButtonText: {
    ...type.bodyStrong,
    color: semantic.canvasDeep,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: radii.control,
    backgroundColor: semantic.actionPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    ...type.bodyStrong,
    color: semantic.canvasDeep,
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: semantic.borderStandard,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.x4,
  },
  secondaryButtonText: {
    ...type.bodyStrong,
    color: semantic.textSecondary,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  stateWrap: {
    alignItems: 'center',
    gap: space.x3,
    paddingTop: space.x10,
    paddingHorizontal: space.x4,
  },
  stateTitle: {
    ...type.title3,
    color: semantic.textPrimary,
  },
  stateText: {
    ...type.caption,
    color: semantic.textMuted,
    textAlign: 'center',
  },
  stateRetry: {
    alignSelf: 'center',
    minWidth: 120,
  },
  groupHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2,
  },
  groupName: {
    ...type.title3,
    color: semantic.textPrimary,
    flex: 1,
  },
  goalMetBadge: {
    ...type.micro,
    color: semantic.success,
    borderWidth: 1,
    borderColor: semantic.success,
    borderRadius: radii.small,
    paddingHorizontal: space.x1,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  groupGoalText: {
    ...type.caption,
    color: semantic.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: semantic.surfaceInset,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: semantic.actionPrimary,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});
