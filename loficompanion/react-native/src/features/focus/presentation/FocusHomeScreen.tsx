import React from "react";
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CompanionState } from "../../skins/domain/types";
import { BUILT_IN_SKINS } from "../../skins/domain/registry";
import { ImmersiveMediaSurface } from "../../skins/presentation/ImmersiveMediaSurface";
import { AppIcon } from "../../../design-system/AppIcon";
import { formatTimerSeconds } from "../../../design-system/FocusTimerRing";
import { useApp } from "../../../state/AppStore";
import { useFocus } from "../application/FocusStore";
import { DEFAULT_ACTIVITY, DEFAULT_DURATION } from "../domain/validate";
import { mediaControl, mediaSurface } from "../../../design-system/derivedTokens";
import { radii, semantic, space, type } from "../../../theme/tokens";
import { ACTIVITY_LABELS, FOCUS_STRINGS as STR } from "./strings";
import { SKIN_STRINGS as SKIN } from "../../skins/presentation/strings";

/**
 * S02 今日陪伴首页（doc-08 §3）。本屏唯一焦点：角色媒体 +「开始专注」。
 * 媒体铺满 Tab 场景并延伸到悬浮 Tab 玻璃之下；点击媒体进入主题选择，
 * 右上角 ‹ › 半透明快切在已上线皮肤间环绕切换（设置在「我的」页有入口）。
 * 底部结果板承载今日战绩与主 CTA，锚定在悬浮 Tab 之上。
 */
export function FocusHomeScreen() {
  const focus = useFocus();
  const { navigate, showToast } = useApp();
  const insets = useSafeAreaInsets();
  const active = focus.activeSession;
  const firstRun = focus.today.minutes === 0 && focus.today.sessions === 0;

  // 快切环绕：按注册表顺序 ±1，未选中过/数据异常从首位起算
  const cycleSkin = (step: 1 | -1) => {
    const total = BUILT_IN_SKINS.length;
    if (total < 2) return;
    const at = Math.max(
      0,
      BUILT_IN_SKINS.findIndex((skin) => skin.id === focus.selectedSkinId),
    );
    const next = BUILT_IN_SKINS[(at + step + total) % total];
    focus.actions.selectSkin(next.id);
    AccessibilityInfo.announceForAccessibility(next.name);
  };

  // 有会话时媒体跟随陪伴状态（暂停/喝水动作可见）；无会话回 ready 基态
  const mediaState: CompanionState = active
    ? (focus.companion.playing?.state ?? focus.companion.state)
    : "ready";

  const startFocus = () => {
    const result = focus.actions.startSession(
      DEFAULT_ACTIVITY,
      DEFAULT_DURATION,
      Date.now(),
    );
    if (result.ok) {
      navigate("focus.active");
      return;
    }
    if (result.reason === "alreadyActive") {
      showToast(STR.sessionRunning, "info");
      navigate("focus.active");
      return;
    }
    showToast(STR.invalidSession, "error");
  };

  const primaryLabel = active
    ? `${STR.backToFocus} · ${formatTimerSeconds(focus.remainingSeconds)}`
    : STR.startFocus;

  const selectorLabel = `${ACTIVITY_LABELS[DEFAULT_ACTIVITY]} · ${DEFAULT_DURATION} 分钟`;

  return (
    <View style={styles.screen}>
      <View style={styles.mediaArea}>
        {/* 点击画面进入主题选择（doc-08 §3 顶部入口随原生 Tab 收敛后移除） */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={SKIN.skinEntry}
          onPress={() => navigate("skins.gallery")}
          style={StyleSheet.absoluteFill}
        >
          <ImmersiveMediaSurface
            manifest={focus.skin}
            state={mediaState}
            reducedMotion={focus.reducedMotion}
            style={StyleSheet.absoluteFill}
          />
        </Pressable>

        {/* 右上皮肤快切（doc-08 §3）：≥2 套内置皮肤才显示，浮于媒体入口之上 */}
        {BUILT_IN_SKINS.length > 1 && (
          <View style={styles.skinSwitcher} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={SKIN.prevSkin}
              onPress={() => cycleSkin(-1)}
              style={({ pressed }) => [
                styles.skinSwitchButton,
                pressed && styles.pressed,
              ]}
            >
              <AppIcon
                name="chevron-left"
                color={semantic.textPrimary}
                size={20}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={SKIN.nextSkin}
              onPress={() => cycleSkin(1)}
              style={({ pressed }) => [
                styles.skinSwitchButton,
                pressed && styles.pressed,
              ]}
            >
              <AppIcon
                name="chevron-right"
                color={semantic.textPrimary}
                size={20}
              />
            </Pressable>
          </View>
        )}

        {/* 问候（安全区下 72、左 20） */}
        <View style={styles.greeting} pointerEvents="none">
          <Text style={styles.greetingText}>{STR.greeting}</Text>
        </View>

        {/* 底部结果板（高约 196、左右 16、悬浮 Tab 之上）：
            iOS 26 悬浮 Tab 约 80pt 高且场景延伸其下，insets.bottom 应含之；
            下限 92 兜底 insets 未透传的平台，避免板子沉入玻璃之下 */}
        <View
          style={[
            styles.board,
            { bottom: Math.max(insets.bottom + space.x2, 92) },
          ]}
        >
          {firstRun ? (
            <Text style={styles.boardEmpty}>{STR.boardEmpty}</Text>
          ) : (
            <View style={styles.statsRow}>
              <Text style={styles.statMain}>
                {STR.todayMinutes(focus.today.minutes)}
              </Text>
              <Text style={styles.statSub}>
                {STR.doneSessions(focus.today.sessions)}
              </Text>
            </View>
          )}
          <View style={styles.boardActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={active ? STR.backToFocus : STR.startFocus}
              onPress={active ? () => navigate("focus.active") : startFocus}
              style={({ pressed }) => [
                styles.primaryCta,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryCtaText}>{primaryLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={STR.chooseActivity}
              onPress={() => navigate("focus.setup")}
              style={({ pressed }) => [
                styles.selector,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.selectorText}>{selectorLabel}</Text>
              <AppIcon
                name="chevron-down"
                color={semantic.textMuted}
                size={18}
              />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.canvasDeep,
  },
  mediaArea: {
    flex: 1,
    overflow: "hidden",
  },
  greeting: {
    position: "absolute",
    top: 24,
    left: 20,
    gap: space.x2,
  },
  greetingText: {
    ...type.title2,
    color: semantic.textPrimary,
  },
  // 与问候语（top 24 / left 20）镜像；box-none 只让圆钮接点击，媒体入口不受遮挡
  skinSwitcher: {
    position: "absolute",
    top: 24,
    right: 20,
    flexDirection: "row",
    gap: space.x1,
  },
  skinSwitchButton: {
    width: 44,
    height: 44,
    borderRadius: radii.round,
    backgroundColor: mediaControl,
    alignItems: "center",
    justifyContent: "center",
  },
  board: {
    position: "absolute",
    left: space.x4,
    right: space.x4,
    height: 196,
    borderRadius: radii.card,
    backgroundColor: mediaSurface,
    borderWidth: 1,
    borderColor: semantic.borderSoft,
    paddingHorizontal: space.x5,
    paddingVertical: space.x4,
    justifyContent: "space-between",
  },
  boardEmpty: {
    ...type.body,
    color: semantic.textSecondary,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  statMain: {
    ...type.title1,
    color: semantic.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  statSub: {
    ...type.body,
    color: semantic.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  boardActions: {
    gap: space.x3,
  },
  primaryCta: {
    minHeight: 52,
    borderRadius: radii.control,
    backgroundColor: semantic.actionPrimary,
    paddingHorizontal: space.x5,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryCtaText: {
    ...type.bodyStrong,
    color: semantic.canvasDeep,
  },
  selector: {
    minHeight: 48,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: semantic.borderStandard,
    paddingHorizontal: space.x4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectorText: {
    ...type.bodyStrong,
    color: semantic.textPrimary,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});
