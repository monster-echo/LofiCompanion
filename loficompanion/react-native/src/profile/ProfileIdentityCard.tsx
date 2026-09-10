import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { invalidateAssetUrl, resolveAssetUrl } from '../data/apiClient';
import { AppCard } from '../design-system/components';
import { AppIcon } from '../design-system/AppIcon';
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
    <ResolvedAvatar
      avatarUrl={avatarUrl}
      label={displayName.slice(0, 1).toUpperCase()}
      size={96}
    />
  );
  return (
    <AppCard>
      <View style={identityStyles.container}>
        {onAvatarPress ? (
          // 可编辑态：头像本身即可点区域，右下角徽标提示可更换（不放文字，保持卡片干净）
          <Pressable
            accessibilityLabel={t('changeAvatarAlt')}
            accessibilityRole="button"
            onPress={onAvatarPress}
            style={identityStyles.avatarAction}
          >
            {avatar}
            <View
              style={[
                identityStyles.avatarBadge,
                { backgroundColor: palette.surface, borderColor: palette.border },
              ]}
            >
              <AppIcon color={palette.text} name="image" size={13} />
            </View>
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

/** 头像显示：兼容 objectKey（→ presigned 24h）/ http(s) / data: 三种形态，加载失败回落首字母。 */
export function ResolvedAvatar({
  avatarUrl,
  label,
  size,
}: Readonly<{ avatarUrl?: string | null; label: string; size: number }>) {
  const { palette } = usePreferences();
  const { t } = useTranslation('profile');
  const [resolved, setResolved] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!avatarUrl) {
      setResolved(null);
      return;
    }
    void resolveAssetUrl(avatarUrl).then(url => {
      if (alive && url) setResolved(url);
    });
    return () => { alive = false; };
  }, [avatarUrl]);
  if (resolved) {
    return (
      <Image
        accessibilityLabel={t('avatarAlt')}
        source={{ uri: resolved }}
        style={identityAvatarStyles.image(size)}
        onError={() => {
          if (avatarUrl) invalidateAssetUrl(avatarUrl);
          setResolved(null);
        }}
      />
    );
  }
  return (
    <View
      style={[
        identityAvatarStyles.frame(size),
        { backgroundColor: palette.brandSoft },
      ]}
    >
      <Text style={[identityAvatarStyles.text(size), { color: palette.brand }]}>
        {label}
      </Text>
    </View>
  );
}

const identityAvatarStyles = {
  image: (size: number) => ({
    width: size,
    height: size,
    borderRadius: radii.round,
  }),
  frame: (size: number) => ({
    width: size,
    height: size,
    borderRadius: radii.round,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  }),
  text: (size: number) => ({
    fontSize: Math.max(14, Math.round(size / 4.8)),
    fontWeight: '700' as const,
  }),
};

const identityStyles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.x3, paddingVertical: spacing.x3 },
  copy: { alignItems: 'center', gap: spacing.x1 },
  bio: {
    textAlign: 'center',
    width: '100%',
    padding: spacing.x3,
    borderRadius: radii.control,
  },
  avatarAction: { alignItems: 'center', justifyContent: 'center' },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.round,
    borderWidth: 1,
  },
});
