import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StudyResultSheet } from '../../../design-system/StudyResultSheet';
import { replaceRoute } from '../../../navigation/navigationRef';
import { useApp } from '../../../state/AppStore';
import { type, type ThemeColors } from '../../../theme/tokens';
import { useThemeStyles } from '../../../theme/useThemeStyles';
import { mediaTextShadow } from '../../../design-system/derivedTokens';
import { ACHIEVEMENT_DEFS } from '../../achievements/domain/rules';
import { effectiveSeconds as computeEffective } from '../domain/engine';
import { useFocus } from '../application/FocusStore';
import { ImmersiveMediaSurface } from '../../skins/presentation/ImmersiveMediaSurface';
import { useTranslation } from 'react-i18next';

/**
 * S06 完成结算（doc-08 §7）。完成态媒体占顶部约 56%；结果 sheet 从约 47%
 * 处开始，CTA 固定。新成就仅在 completions 携带时展示（不伪造）；无成就
 * 时卡片移除、sheet 自然收缩。completions 为空（深链/回退导航）→ 回首页。
 */

const TITLE_DELAY_MS = 200;
const TITLE_MS = 240;
const REDUCED_TITLE_MS = 100;
/** 标题入场位移：自上 -8dp 沉降到位 */
const TITLE_OFFSET = -8;
export function FocusCompleteScreen() {
  const styles = useThemeStyles(makeStyles);
  const focus = useFocus();
  const { t } = useTranslation('focus');
  const { t: tAchievements } = useTranslation('achievements');
  const { replace } = useApp();
  const insets = useSafeAreaInsets();
  // 仅按「挂载时」判定深导航：后续 acknowledge 不触发已入栈的旧实例跳转
  const deepNav = useRef(focus.completions === null);
  // 标题入场：短暂延迟后下沉淡入（与 sheet 上滑错峰，完成页的第一个动词）
  const titleIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (deepNav.current || !focus.completions) return;
    Animated.sequence([
      Animated.delay(focus.reducedMotion ? 0 : TITLE_DELAY_MS),
      Animated.timing(titleIn, {
        toValue: 1,
        duration: focus.reducedMotion ? REDUCED_TITLE_MS : TITLE_MS,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [focus.completions, focus.reducedMotion, titleIn]);

  useEffect(() => {
    if (deepNav.current) replace('home');
  }, [replace]);

  if (deepNav.current || !focus.completions) return null;
  const completion = focus.completions;

  const firstGrant = completion.grants[0];
  const grantDef = firstGrant
    ? ACHIEVEMENT_DEFS.find((def) => def.ruleKey === firstGrant)
    : undefined;

  const again = () => {
    focus.actions.acknowledgeCompletions();
    replaceRoute('focus.setup');
  };
  const finishToday = () => {
    focus.actions.acknowledgeCompletions();
    replace('home');
  };

  return (
    <View style={styles.screen}>
      <ImmersiveMediaSurface
        manifest={focus.skin}
        state="completed"
        reducedMotion={focus.reducedMotion}
        style={styles.media}
      />
      <Animated.View
        style={[
          styles.titleWrap,
          {
            top: insets.top + 24,
          },
          {
            opacity: titleIn,
            transform: [
              {
                translateY: titleIn.interpolate({
                  inputRange: [0, 1],
                  outputRange: [TITLE_OFFSET, 0],
                }),
              },
            ],
          },
        ]}
        pointerEvents="none"
      >
        <Text style={styles.title}>{t('completeTitle')}</Text>
      </Animated.View>

      <StudyResultSheet
        visible
        sessionSeconds={computeEffective(
          completion.session,
          completion.session.completedAtUtc ?? Date.now(),
        )}
        todayMinutes={completion.todayMinutes}
        weekMinutes={completion.weekMinutes}
        weekTarget={focus.week.targetMinutes}
        newAchievement={
          grantDef
            ? { name: tAchievements(`rule.${grantDef.ruleKey}.name`), rewardItemId: grantDef.rewardItemId }
            : undefined
        }
        primaryAction={{ label: t('againAction'), onPress: again }}
        secondaryAction={{ label: t('finishToday'), onPress: finishToday }}
        reducedMotion={focus.reducedMotion}
        // StudyResultSheet 是独立窗口表面：CTA 需要 安全区 + 12
        bottomInset={insets.bottom}
      />
    </View>
  );
}

const makeStyles = (p: ThemeColors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: p.canvasDeep,
  },
  media: {
    height: '56%',
    width: '100%',
  },
  titleWrap: {
    position: 'absolute',
    top: 24,
    left: 20,
  },
  title: {
    ...type.title1,
    // 压在 completed 影像上：onMedia 固定浅色 + 媒体文字投影（主题无关）
    color: p.onMedia,
    ...mediaTextShadow,
  },
});
