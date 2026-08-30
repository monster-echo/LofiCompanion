import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon, IconName } from '../design-system/AppIcon';
import { useApp } from '../state/AppStore';
import { AppRoute } from './routes';
import { usePreferences } from '../preferences/PreferencesProvider';
import { colors, radii, semantic, space } from '../theme/tokens';

export type PrimaryTab = 'home' | 'achievements' | 'leaderboard' | 'profile';

type TabDef = Readonly<{
  key: PrimaryTab;
  icon: IconName;
  route: AppRoute;
  zh: string;
  en: string;
}>;

// doc-08 §1：四个 Tab 根页——专注 / 成就 / 排行 / 我的
const TABS: readonly TabDef[] = [
  { key: 'home', icon: 'droplet', route: 'home', zh: '专注', en: 'Focus' },
  { key: 'achievements', icon: 'bookmark', route: 'achievements.home', zh: '成就', en: 'Achievements' },
  { key: 'leaderboard', icon: 'group', route: 'leaderboard.home', zh: '排行', en: 'Ranks' },
  { key: 'profile', icon: 'user', route: 'profile.home', zh: '我的', en: 'Me' },
];

/**
 * 悬浮胶囊 Tab bar（doc-07 §5：surface + 1px borderSoft，无投影；
 * §7.3 高 64 + 底部安全区）。选中项 brandSoft 药丸 + 雨蓝文字，
 * 填充感由药丸底色提供，不只依赖颜色（doc-07 §8）。
 */
export function PrimaryTabs({ active }: Readonly<{ active: PrimaryTab }>) {
  const { replace } = useApp();
  const { locale } = usePreferences();
  return (
    <View style={tabStyles.dock}>
      <View style={tabStyles.bar}>
        {TABS.map((tab) => (
          <Tab
            key={tab.key}
            active={active === tab.key}
            icon={tab.icon}
            label={locale === 'en-US' ? tab.en : tab.zh}
            onPress={() => replace(tab.route)}
          />
        ))}
      </View>
    </View>
  );
}

function Tab({ active, icon, label, onPress }: Readonly<{
  active: boolean;
  icon: IconName;
  label: string;
  onPress: () => void;
}>) {
  const color = active ? semantic.actionPrimary : semantic.textMuted;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [tabStyles.item, active && { backgroundColor: colors.brandSoft }, pressed && tabStyles.pressed]}
    >
      <AppIcon name={icon} color={color} size={22} />
      <Text style={[tabStyles.label, { color }]}>{label}</Text>
    </Pressable>
  );
}

const tabStyles = StyleSheet.create({
  dock: {
    // 与屏幕左右下留白，保持悬浮胶囊观感
    paddingHorizontal: space.x4,
    paddingBottom: space.x3,
  },
  bar: {
    height: 64, // doc-07 §7.3 Tab bar 高 64（底部安全区由外层 SafeArea 承担）
    flexDirection: 'row',
    borderRadius: radii.sheet,
    gap: space.x1,
    paddingHorizontal: space.x2,
    backgroundColor: semantic.surface,
    borderWidth: 1,
    borderColor: semantic.borderSoft,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.x1,
    paddingVertical: space.x1,
    borderRadius: 18,
  },
  pressed: {
    opacity: 0.82,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
});
