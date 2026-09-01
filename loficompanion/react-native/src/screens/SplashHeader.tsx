import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, radii, spacing } from '../theme/tokens';
import { styles } from '../theme/styles';

type SplashHeaderProps = Readonly<{
  canSkip: boolean;
  countdown: number;
  onSkip: () => void;
  surfaceColor: string;
}>;

export function SplashHeader({
  canSkip,
  countdown,
  onSkip,
  surfaceColor,
}: SplashHeaderProps) {
  const { t } = useTranslation('launch');
  return (
    <View style={headerStyles.header}>
      <View
        accessibilityLabel={t('promoCountdownA11y', { n: countdown })}
        accessibilityLiveRegion="polite"
        style={[headerStyles.countdown, { backgroundColor: surfaceColor }]}
      >
        <Text style={headerStyles.countdownNumber}>{countdown}</Text>
      </View>
      {canSkip ? (
        <Pressable
          accessibilityLabel={t('skipPromo')}
          accessibilityRole="button"
          onPress={onSkip}
          style={headerStyles.skip}
        >
          <Text style={styles.secondary}>{t('skip')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const headerStyles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  skip: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: spacing.x3,
  },
  countdown: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    borderRadius: radii.round,
  },
  countdownNumber: { fontSize: 18, fontWeight: '700', color: colors.brand },
});
