import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppCard } from '../design-system/components';
import { usePreferences } from '../preferences/PreferencesProvider';
import { radii, spacing } from '../theme/tokens';
import { styles } from '../theme/styles';
import { useTranslation } from 'react-i18next';

export function ProfileIdentityCard({
  displayName,
  username,
  email,
  bio,
  avatarUrl,
  onAvatarPress,
}: Readonly<{
  displayName: string;
  username: string;
  /** null = 未绑定（含伪邮箱）：整行不渲染，不展示占位文案 */
  email: string | null;
  bio: string;
  avatarUrl?: string | null;
  onAvatarPress?: () => void;
}>) {
  const { palette } = usePreferences();
  const { t } = useTranslation('profile');
  const avatar = (
    <ProfileAvatar
      avatarUrl={avatarUrl}
      label={displayName.slice(0, 1).toUpperCase()}
    />
  );
  return (
    <AppCard>
      <View style={identityStyles.container}>
        {onAvatarPress ? (
          <Pressable
            accessibilityLabel={t('changeAvatarAlt')}
            accessibilityRole="button"
            onPress={onAvatarPress}
            style={identityStyles.avatarAction}
          >
            {avatar}
            <Text style={[identityStyles.avatarHint, { color: palette.brand }]}>{t('changeAvatarHint')}</Text>
          </Pressable>
        ) : avatar}
        <View style={identityStyles.copy}>
          <Text style={styles.heading}>{displayName}</Text>
          <Text style={styles.caption}>@{username}</Text>
          {email ? <Text style={styles.secondary}>{email}</Text> : null}
        </View>
        <Text
          style={[
            identityStyles.bio,
            { backgroundColor: palette.surfaceMuted, color: palette.textSecondary },
          ]}
        >
          {bio || t('bioEmpty')}
        </Text>
      </View>
    </AppCard>
  );
}

function ProfileAvatar({
  avatarUrl,
  label,
}: Readonly<{ avatarUrl?: string | null; label: string }>) {
  const { palette } = usePreferences();
  const { t } = useTranslation('profile');
  if (avatarUrl) {
    return (
      <Image
        accessibilityLabel={t('avatarAlt')}
        source={{ uri: avatarUrl }}
        style={identityStyles.avatar}
      />
    );
  }
  return (
    <View style={[identityStyles.avatar, { backgroundColor: palette.brandSoft }]}>
      <Text style={[identityStyles.avatarText, { color: palette.brand }]}>{label}</Text>
    </View>
  );
}

const identityStyles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.x3, paddingVertical: spacing.x3 },
  copy: { alignItems: 'center', gap: spacing.x1 },
  bio: {
    textAlign: 'center',
    width: '100%',
    padding: spacing.x3,
    borderRadius: radii.control,
  },
  avatarAction: { alignItems: 'center', gap: spacing.x2 },
  // avatarHint 颜色由渲染处 palette.brand 注入
  avatarHint: { fontWeight: '700' },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '700' },
});
