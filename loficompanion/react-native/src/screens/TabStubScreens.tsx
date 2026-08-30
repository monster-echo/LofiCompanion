import React, { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { PageHeader } from '../design-system/components';
import { PrimaryTabs } from '../navigation/PrimaryTabs';
import { styles } from '../theme/styles';

/**
 * 成就 / 排行两个 Tab 根页的最小占位（P0-A Task 9）。
 * Task 10 接入真实成就与排行榜后整体替换。
 */

function StubScreen({
  title,
  active,
  hint,
}: Readonly<{ title: string; active: 'achievements' | 'leaderboard'; hint?: string }>) {
  return (
    <View style={styles.page}>
      <PageHeader title={title} />
      <View style={styles.centered}>
        <Text style={styles.secondary}>P0-B 接入</Text>
        {hint ? <Text style={styles.caption}>{hint}</Text> : null}
      </View>
      <PrimaryTabs active={active} />
    </View>
  );
}

export function AchievementsHomeStub(): ReactNode {
  return <StubScreen title="学习成就" active="achievements" />;
}

export function LeaderboardHomeStub(): ReactNode {
  return (
    <StubScreen
      title="学习排行榜"
      active="leaderboard"
      hint="登录后可与好友同榜，仅统计完成的专注"
    />
  );
}
