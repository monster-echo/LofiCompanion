import React, { useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { radii, semantic, space, type } from '../theme/tokens';
import { AppIcon, IconName } from './AppIcon';

export type FocusActionItem = Readonly<{
  key: string;
  icon: IconName;
  label: string;
  onPress: () => void;
  /** accent：雨蓝描边+前景（如喝水）；neutral：中性次文字（如结束，确认后才转 danger） */
  variant: 'accent' | 'neutral';
  disabled?: boolean;
  /** 辅助短说明（如冷却剩余），以 micro 胶囊展示 */
  badge?: string;
}>;

type FocusActionBarProps = Readonly<{
  items: readonly FocusActionItem[];
}>;

// doc-07 §7.3 紧凑动作按钮：高 44、水平内边距 14、最小宽 76；同组间距 8
const PRESS_SCALE = 0.98;
const PRESS_OPACITY = 0.82;
const PRESS_MS = 120;

/**
 * doc-08 §5/S04 控制栏：暂停、喝水、结束等紧凑动作排。
 * 按下反馈 120ms scale(0.98) + 亮度降低（以 opacity 表达，动效仅 transform/opacity）。
 */
export function FocusActionBar({ items }: FocusActionBarProps) {
  return (
    <View style={styles.row} accessibilityRole="toolbar">
      {items.map((item) => (
        <FocusActionButton key={item.key} item={item} />
      ))}
    </View>
  );
}

function FocusActionButton({ item }: Readonly<{ item: FocusActionItem }>) {
  const animation = useRef(new Animated.Value(1)).current;
  const accent = item.variant === 'accent';
  const foreground = accent ? semantic.actionPrimary : semantic.textSecondary;

  const toPressed = () => {
    Animated.timing(animation, {
      toValue: 0,
      duration: PRESS_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  };
  const toRest = () => {
    Animated.timing(animation, {
      toValue: 1,
      duration: PRESS_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.badge ? `${item.label}，${item.badge}` : item.label}
      accessibilityState={{ disabled: item.disabled === true }}
      disabled={item.disabled}
      onPress={item.onPress}
      onPressIn={toPressed}
      onPressOut={toRest}
      style={styles.hitArea}
    >
      <Animated.View
        style={[
          styles.button,
          accent ? styles.accent : styles.neutral,
          item.disabled && styles.disabled,
          {
            transform: [{ scale: animation.interpolate({ inputRange: [0, 1], outputRange: [PRESS_SCALE, 1] }) }],
            opacity: animation.interpolate({ inputRange: [0, 1], outputRange: [PRESS_OPACITY, 1] }),
          },
        ]}
      >
        <AppIcon name={item.icon} color={foreground} size={20} />
        <Text style={[styles.label, { color: foreground }]} numberOfLines={1}>
          {item.label}
        </Text>
        {item.badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{item.badge}</Text>
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space.x2,
    flexWrap: 'wrap',
  },
  hitArea: {
    minHeight: 44,
    justifyContent: 'center',
  },
  button: {
    minHeight: 44,
    minWidth: 76,
    borderRadius: radii.control,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: space.x2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.x2,
  },
  accent: {
    borderColor: semantic.borderStandard,
    backgroundColor: 'transparent',
  },
  neutral: {
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    ...type.label,
    fontWeight: type.bodyStrong.fontWeight,
  },
  badge: {
    borderRadius: radii.round,
    backgroundColor: semantic.surfaceInset,
    paddingHorizontal: space.x2,
    paddingVertical: 2,
  },
  badgeText: {
    ...type.micro,
    color: semantic.textSecondary,
  },
});
