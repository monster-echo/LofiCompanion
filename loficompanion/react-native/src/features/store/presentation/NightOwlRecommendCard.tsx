import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppIcon } from '../../../design-system/AppIcon';
import { mediaBorderSoft } from '../../../design-system/derivedTokens';
import { usePreferences } from '../../../preferences/PreferencesProvider';
import { telemetry } from '../../../telemetry/Telemetry';
import { radii, semantic, space, type, type ThemeColors } from '../../../theme/tokens';
import { useThemeStyles } from '../../../theme/useThemeStyles';

/**
 * 夜猫子场景推荐卡（F4 场景化触达）：浮在首页结果板上方的媒体层玻璃小卡，
 * 与结果板同语言（mediaGlass + onMedia 固定浅字）。整卡可点进详情页，
 * 右上 X 关闭（关闭走 7 天冷却，不是永久拉黑）。shown/tapped/dismissed
 * 三事件齐发，转化漏斗可归因。
 */
export function NightOwlRecommendCard({
  slug,
  nightSessions,
  onTap,
  onDismiss,
}: Readonly<{
  slug: string;
  /** 命中画像的夜间会话数（遥测归因用） */
  nightSessions: number;
  onTap: () => void;
  onDismiss: () => void;
}>) {
  const { t } = useTranslation('store');
  const { palette } = usePreferences();
  const styles = useThemeStyles(makeStyles);
  // 每次挂载（= 每次从不可见变可见）至多报一次 shown
  const shownReportedRef = useRef(false);
  useEffect(() => {
    if (shownReportedRef.current) return;
    shownReportedRef.current = true;
    telemetry.track('night_owl_card_shown', { slug, night_sessions: nightSessions });
  }, [slug, nightSessions]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('nightOwlTitle')} ${t('nightOwlBody')}`}
      onPress={() => {
        telemetry.track('night_owl_card_tapped', { slug });
        onTap();
      }}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.textArea}>
        <Text style={styles.title}>{t('nightOwlTitle')}</Text>
        <Text style={styles.body} numberOfLines={2}>{t('nightOwlBody')}</Text>
        <Text style={styles.cta}>{t('nightOwlCta')}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('nightOwlDismiss')}
        onPress={() => {
          telemetry.track('night_owl_card_dismissed', { slug });
          onDismiss();
        }}
        style={styles.dismiss}
        hitSlop={8}
      >
        <AppIcon name="close" color={palette.onMediaSecondary} size={16} />
      </Pressable>
    </Pressable>
  );
}

const makeStyles = (p: ThemeColors) => StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.card,
    // 与结果板同语言：媒体层固定暗玻璃 + onMedia 浅字（严禁随主题翻转的 token）
    backgroundColor: semantic.mediaGlass,
    borderWidth: 1,
    borderColor: mediaBorderSoft,
    paddingLeft: space.x4,
    paddingRight: space.x3,
    paddingVertical: space.x3,
    gap: space.x3,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  textArea: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...type.bodyStrong,
    color: p.onMedia,
  },
  body: {
    ...type.caption,
    color: p.onMediaSecondary,
  },
  cta: {
    ...type.caption,
    color: p.onMedia,
    marginTop: 2,
  },
  dismiss: {
    width: 32,
    height: 32,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
