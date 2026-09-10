import React, { ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleProp,
  Switch,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppRoute } from '../navigation/routes';
import { useApp } from '../state/AppStore';
import { semantic } from '../theme/tokens';
import { styles } from '../theme/styles';
import { AppIcon, IconName } from './AppIcon';
import { telemetry } from '../telemetry/Telemetry';
import { usePreferences } from '../preferences/PreferencesProvider';
import { buttonStyles, componentStyles } from './componentStyles';
import { mediaActionBorder, mediaActionGlass } from './derivedTokens';
import { useTranslation } from 'react-i18next';

export function AppButton({
  label,
  onPress,
  icon,
  variant = 'primary',
  disabled = false,
  analyticsId,
}: Readonly<{
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  analyticsId?: string;
}>) {
  const { palette } = usePreferences();
  const variantStyle = variant === 'primary'
    ? buttonStyles.primary
    : variant === 'danger'
      ? buttonStyles.danger
      : buttonStyles.secondary;
  // primary 可用态 = 全 app 统一玻璃蓝（buttonStyles.primary），前景随主题翻转
  // （暗=纸白同 onMedia，亮=墨字——亮色画布上玻璃合成浅色，恒白不可读）；
  // 危险实底可用态前景恒白（semantic.onAction）——彩色底上的高对比惯例；
  // 禁用态弱化为次级文字色（doc-07「禁用态保持可读」意图）。
  const foreground = disabled
    ? palette.textSecondary
    : variant === 'secondary'
      ? palette.text
      : variant === 'danger'
        ? semantic.onAction
        : palette.textPrimary;
  const background = disabled
    ? (variant === 'secondary' ? palette.surface : palette.actionDisabled)
    : variant === 'secondary'
      ? palette.surface
      : variant === 'danger' ? palette.error : mediaActionGlass;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => {
        telemetry.track('ui_action', { action_id: analyticsId ?? `button.${label}` });
        onPress();
      }}
      style={({ pressed }) => [
        buttonStyles.base,
        variantStyle,
        {
          backgroundColor: background,
          borderColor: variant === 'secondary'
            ? palette.border
            : variant === 'primary' && !disabled
              ? mediaActionBorder
              : background,
        },
        pressed && buttonStyles.pressed,
        disabled && buttonStyles.disabledOpacityless,
      ]}
    >
      {icon ? <AppIcon name={icon} color={foreground} size={20} /> : null}
      <Text style={[buttonStyles.label, { color: foreground }]}>{label}</Text>
    </Pressable>
  );
}

export function OfflineBanner() {
  const { online, refreshBootstrap } = useApp();
  const { palette } = usePreferences();
  const { t } = useTranslation('common');
  if (online) return null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => void refreshBootstrap()}
      style={componentStyles.offline}
    >
      <AppIcon name="alert" color={palette.warning} size={18} />
      <Text style={[componentStyles.offlineText, { color: palette.text }]}>
        {t('offlineBanner')}
      </Text>
    </Pressable>
  );
}

export function IconButton({
  label,
  icon,
  onPress,
}: Readonly<{ label: string; icon: IconName; onPress: () => void }>) {
  const { palette } = usePreferences();
  return (
    <Pressable accessibilityLabel={label} onPress={onPress} style={buttonStyles.icon}>
      <AppIcon name={icon} color={palette.text} />
    </Pressable>
  );
}

type PageHeaderAction = Readonly<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
}>;

export function PageHeader({
  title,
  rightAction,
}: Readonly<{ title: string; rightAction?: PageHeaderAction }>) {
  const { t } = useTranslation('common');
  const { back, canGoBack } = useApp();
  const { palette } = usePreferences();
  // 顶部安全区自包含：全局垫充已移除，头部自行避让状态栏
  // （headerTitle 绝对定位，height 须同步加上 insets.top，否则行内容溢出）
  const insets = useSafeAreaInsets();
  return (
    <View style={[
      componentStyles.header,
      {
        backgroundColor: palette.background,
        borderBottomColor: palette.border,
        paddingTop: insets.top,
        height: 48 + insets.top,
      },
    ]}>
      {/* 绝对定位标题必须显式锚定 top：Yoga 3 对无 top 的绝对子元素不再受
          alignItems 居中约束，会贴到 padding 原点（=灵动岛正下方）；
          lineHeight=头部行高 48 使单行标题垂直居中。头部按固定单行设计，
          长标题必须截断——折行的第二行会溢出头部叠到正文上
          （订阅条款英文标题 "Subscription & Auto-Renewal Terms" 曾触发）。 */}
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={[componentStyles.headerTitle, { color: palette.text, top: insets.top, lineHeight: 48 }]}
      >
        {title}
      </Text>
      <View style={componentStyles.headerSide}>
        {canGoBack ? (
          <IconButton label={t('back')} icon="arrow-left" onPress={back} />
        ) : null}
      </View>
      <View style={[componentStyles.headerSide, componentStyles.headerRight]}>
        {rightAction ? (
          <Pressable
            accessibilityLabel={rightAction.label}
            accessibilityRole="button"
            disabled={rightAction.disabled}
            onPress={rightAction.onPress}
            style={componentStyles.headerAction}
          >
            <Text style={[
              componentStyles.headerActionText,
              { color: palette.brand },
              rightAction.disabled && buttonStyles.disabled,
            ]}>
              {rightAction.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function AppCard({ children }: Readonly<{ children: ReactNode }>) {
  const { palette } = usePreferences();
  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      {children}
    </View>
  );
}

export function ListRow({
  label,
  description,
  route,
  icon,
  iconColor,
  value,
  destructive = false,
  onPress,
  analyticsId,
}: Readonly<{
  label: string;
  /** 标题下方的说明行：独占整行宽度，长文案自然换行（区别于右侧挤压易折行的 value） */
  description?: string;
  route?: AppRoute;
  icon?: IconName;
  iconColor?: string;
  value?: string;
  destructive?: boolean;
  onPress?: () => void;
  analyticsId?: string;
}>) {
  const { navigate } = useApp();
  const { palette } = usePreferences();
  const action = onPress ?? (route ? () => navigate(route) : undefined);
  return (
    <Pressable
      onPress={action ? () => {
        telemetry.track('ui_action', {
          action_id: analyticsId ?? route ?? `row.${label}`,
        });
        action();
      } : undefined}
      disabled={!action}
      style={styles.row}
    >
      {icon ? (
        <AppIcon
          name={icon}
          color={destructive ? palette.error : iconColor ?? palette.textSecondary}
          size={20}
        />
      ) : null}
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, destructive && componentStyles.destructive]}>{label}</Text>
        {description ? <Text style={styles.secondary}>{description}</Text> : null}
      </View>
      {value ? <Text style={styles.secondary}>{value}</Text> : null}
      {action ? <AppIcon name="chevron-right" color={palette.textSecondary} size={18} /> : null}
    </Pressable>
  );
}

export function ToggleRow({
  label,
  value,
  onChange,
}: Readonly<{ label: string; value: boolean; onChange: (value: boolean) => void }>) {
  const { palette } = usePreferences();
  return (
    <View style={styles.row}>
      <Text style={styles.rowText}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: palette.border, true: palette.brand }}
      />
    </View>
  );
}

// 键盘避让页面容器：iOS 上键盘弹出时按「视图与键盘的重叠高度」逐帧上推内容
// （react-native-keyboard-controller 的帧同步动画，优于 RN 内置 KAV 的跳变）；
// Android 不参与——系统 adjustResize 已压缩窗口，behavior 传 undefined 时
// 该库源码直接返回空样式，等价透明包装，避免双重偏移。
export function KeyboardAvoidingScreen({
  children,
  style,
}: Readonly<{ children: ReactNode; style?: StyleProp<ViewStyle> }>) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[{ flex: 1 }, style]}
    >
      {/* 底部安全区放内层 View：KAV behavior="padding" 的动画样式会覆盖容器
          自身静态 paddingBottom，垫在子视图上才能键盘收起时不丢失 */}
      <View style={[{ flex: 1 }, { paddingBottom: insets.bottom }]}>
        {children}
      </View>
    </KeyboardAvoidingView>
  );
}
