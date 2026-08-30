import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StudyResultSheet } from '../../../design-system/StudyResultSheet';
import { replaceRoute } from '../../../navigation/navigationRef';
import { useApp } from '../../../state/AppStore';
import { semantic, type } from '../../../theme/tokens';
import { ACHIEVEMENT_DEFS } from '../../achievements/domain/rules';
import { effectiveSeconds as computeEffective } from '../domain/engine';
import { useFocus } from '../application/FocusStore';
import { ImmersiveMediaSurface } from '../../skins/presentation/ImmersiveMediaSurface';
import { FOCUS_STRINGS as STR } from './strings';

/**
 * S06 完成结算（doc-08 §7）。完成态媒体占顶部约 56%；结果 sheet 从约 47%
 * 处开始，CTA 固定。新成就仅在 completions 携带时展示（不伪造）；无成就
 * 时卡片移除、sheet 自然收缩。completions 为空（深链/回退导航）→ 回首页。
 */
export function FocusCompleteScreen() {
  const focus = useFocus();
  const { replace } = useApp();
  const insets = useSafeAreaInsets();
  // 仅按「挂载时」判定深导航：后续 acknowledge 不触发已入栈的旧实例跳转
  const deepNav = useRef(focus.completions === null);

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
      <Text style={styles.title}>{STR.completeTitle}</Text>

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
          grantDef ? { name: grantDef.name, rewardItemId: grantDef.rewardItemId } : undefined
        }
        primaryAction={{ label: STR.againAction, onPress: again }}
        secondaryAction={{ label: STR.finishToday, onPress: finishToday }}
        reducedMotion={focus.reducedMotion}
        // Modal 不继承外层 SafeAreaView：CTA 需要 安全区 + 12
        bottomInset={insets.bottom}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.canvasDeep,
  },
  media: {
    height: '56%',
    width: '100%',
  },
  title: {
    ...type.title1,
    color: semantic.textPrimary,
    position: 'absolute',
    top: 24,
    left: 20,
  },
});
