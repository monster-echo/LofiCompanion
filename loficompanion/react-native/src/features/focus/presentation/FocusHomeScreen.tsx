import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
// Pressable 仅剩媒体入口（absoluteFill，无按压视觉）使用；可按压控件走 PressableScale
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiClient } from "../../../data/apiClient";
import type { SkinProductRemote } from "../../../data/apiClient";
import type { StorageDriver } from "../../focus/data/storageDriver";
import type { CompanionState, SkinManifest } from "../../skins/domain/types";
import { ImmersiveMediaSurface } from "../../skins/presentation/ImmersiveMediaSurface";
import { AppIcon } from "../../../design-system/AppIcon";
import { formatTimerSeconds } from "../../../design-system/FocusTimerRing";
import { useApp } from "../../../state/AppStore";
import { usePreferences } from "../../../preferences/PreferencesProvider";
import { useFocus } from "../application/FocusStore";
import { useSkinTrials } from "../../store/application/SkinTrialProvider";
import { useTrialExpiryGuard } from "../../store/application/useTrialExpiryGuard";
import {
  createRecommendationPrefsRepository,
} from "../../store/data/recommendationPrefs";
import {
  NIGHT_OWL_TARGET_SLUG,
  nightOwlStats,
  shouldShowNightOwlCard,
} from "../../store/domain/nightOwl";
import { NightOwlRecommendCard } from "../../store/presentation/NightOwlRecommendCard";
import { DEFAULT_ACTIVITY, DEFAULT_DURATION } from "../domain/validate";
import {
  mediaActionBorder,
  mediaActionGlass,
  mediaBorderSoft,
  mediaControl,
} from "../../../design-system/derivedTokens";
import { PressableScale } from "../../../design-system/PressableScale";
import { radii, semantic, space, type, type ThemeColors } from "../../../theme/tokens";
import { useThemeStyles } from "../../../theme/useThemeStyles";
import { useTranslation } from "react-i18next";

/**
 * S02 今日陪伴首页（doc-08 §3）。本屏唯一焦点：角色媒体 +「开始专注」。
 * 媒体铺满 Tab 场景并延伸到悬浮 Tab 玻璃之下；点击媒体进入主题选择，
 * 右上角 ‹ › 半透明快切在已上线皮肤间环绕切换（设置在「我的」页有入口）。
 * 底部结果板承载今日战绩与主 CTA，锚定在悬浮 Tab 之上。
 */
// 推荐关闭记录用 AsyncStorage 适配（仅首页场景卡；与详情页待完成订单同范式）
const storageDriver: StorageDriver = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  remove: (key) => AsyncStorage.removeItem(key),
};

export function FocusHomeScreen() {
  const { palette } = usePreferences();
  const styles = useThemeStyles(makeStyles);
  const focus = useFocus();
  const trials = useSkinTrials();
  const { navigate, showToast, user } = useApp();
  const { t: tSkin } = useTranslation('skins');
  const { t } = useTranslation('focus');
  const insets = useSafeAreaInsets();
  const active = focus.activeSession;
  const firstRun = focus.today.minutes === 0 && focus.today.sessions === 0;

  // 快切判锁数据：公开商品目录 +（已登录时）权益键。拉取失败降级为不判锁
  // （快切不被网络状态卡住；付费购买路径仍由画廊/商店详情把关）。
  const [productsBySlug, setProductsBySlug] = useState<
    Readonly<Record<string, SkinProductRemote>>
  >({});
  const [ownedKeys, setOwnedKeys] = useState<readonly string[]>([]);
  const [ownedKnown, setOwnedKnown] = useState(user === null);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const { products } = await apiClient.skinProducts();
        if (!mounted) return;
        const bySlug: Record<string, SkinProductRemote> = {};
        for (const product of products) bySlug[product.slug] = product;
        setProductsBySlug(bySlug);
      } catch { /* 离线：无法判锁，快切保持可用 */ }
      if (user === null) return;
      try {
        // 会员键（auth）∪ 皮肤键（biz）聚合，快切判锁两域都看
        const keys = await apiClient.ownedEntitlementKeys();
        if (!mounted) return;
        setOwnedKeys(keys);
        setOwnedKnown(true);
      } catch { /* 权益未知：不判锁 */ }
    })();
    return () => { mounted = false; };
  }, [user]);

  // 未拥有的付费皮肤（未登录恒锁；登录后以权益键为准，未知时不判锁）。
  // 试用中皮肤放行——24h 窗口内等同可用（到期由回落守卫收尾）。
  const isLocked = (skin: SkinManifest): boolean => {
    if (skin.accessType !== "paid") return false;
    if (user === null) return true;
    if (trials.isTrialActive(skin.slug)) return false;
    if (!ownedKnown) return false;
    const product = productsBySlug[skin.slug];
    return product !== undefined && !ownedKeys.includes(product.entitlementKey);
  };

  // 试用到期回落守卫（拥有判定与 isLocked 同源：商品目录 + 权益键）
  const isOwnedSlug = useCallback(
    (slug: string) => {
      const product = productsBySlug[slug];
      return product !== undefined && ownedKeys.includes(product.entitlementKey);
    },
    [productsBySlug, ownedKeys],
  );
  useTrialExpiryGuard({ isOwnedSlug });

  // —— 夜猫子场景推荐卡（F4）：本地画像（近14天 ≥3 次本地 22-5 点完成）+
  // 未拥有 + 未试用 + 关闭冷却已过。关闭记录挂 AsyncStorage（7 天冷却）。
  // dismissedAt: undefined=读取中（不显示，防闪现）；null=从未关闭；number=关闭时刻。
  const [dismissedAt, setDismissedAt] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    let mounted = true;
    const prefs = createRecommendationPrefsRepository(storageDriver);
    void prefs.dismissedAt(NIGHT_OWL_TARGET_SLUG).then((at) => {
      if (mounted) setDismissedAt(at);
    });
    return () => { mounted = false; };
  }, []);
  const nightOwlVisible = useMemo(() => {
    if (dismissedAt === undefined) return false;
    return shouldShowNightOwlCard({
      stats: nightOwlStats(focus.history, Date.now()),
      product: productsBySlug[NIGHT_OWL_TARGET_SLUG] ?? null,
      ownedKeys,
      trialActive: trials.isTrialActive(NIGHT_OWL_TARGET_SLUG),
      dismissedAtUtc: dismissedAt,
      now: Date.now(),
    });
  }, [dismissedAt, focus.history, ownedKeys, productsBySlug, trials]);
  const dismissNightOwlCard = useCallback(() => {
    const now = Date.now();
    setDismissedAt(now);
    void createRecommendationPrefsRepository(storageDriver).dismiss(NIGHT_OWL_TARGET_SLUG, now);
  }, []);

  // 快切环绕：按注册表顺序（内置默认 + 已拉取的云端皮肤）±1，未选中过/数据
  // 异常从首位起算；跳过判锁皮肤
  const cycleSkin = (step: 1 | -1) => {
    const total = focus.skins.length;
    if (total < 2) return;
    const at = Math.max(
      0,
      focus.skins.findIndex((skin) => skin.id === focus.selectedSkinId),
    );
    for (let i = 1; i <= total; i += 1) {
      const next = focus.skins[((at + step * i) % total + total) % total];
      if (isLocked(next)) continue;
      focus.actions.selectSkin(next.id);
      AccessibilityInfo.announceForAccessibility(next.name);
      return;
    }
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
      showToast(t('sessionRunning'), "info");
      navigate("focus.active");
      return;
    }
    showToast(t('invalidSession'), "error");
  };

  const primaryLabel = active
    ? `${t('backToFocus')} · ${formatTimerSeconds(focus.remainingSeconds)}`
    : t('startFocus');

  const selectorLabel = `${t(`activity.${DEFAULT_ACTIVITY}`)} · ${DEFAULT_DURATION} ${t('customUnit')}`;

  return (
    <View style={styles.screen}>
      <View style={styles.mediaArea}>
        {/* 点击画面进入主题选择（doc-08 §3 顶部入口随原生 Tab 收敛后移除） */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tSkin('skinEntry')}
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

        {/* 右上皮肤快切（doc-08 §3）：≥2 套可用皮肤才显示，浮于媒体入口之上 */}
        {focus.skins.length > 1 && (
          <View style={[styles.skinSwitcher, { top: insets.top + 24 }]} pointerEvents="box-none">
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={tSkin('prevSkin')}
              onPress={() => cycleSkin(-1)}
              reducedMotion={focus.reducedMotion}
              style={styles.skinSwitchButton}
            >
              <AppIcon
                name="chevron-left"
                color={palette.onMedia}
                size={20}
              />
            </PressableScale>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={tSkin('nextSkin')}
              onPress={() => cycleSkin(1)}
              reducedMotion={focus.reducedMotion}
              style={styles.skinSwitchButton}
            >
              <AppIcon
                name="chevron-right"
                color={palette.onMedia}
                size={20}
              />
            </PressableScale>
          </View>
        )}

        {/* 问候（状态栏下 24、左 20） */}
        <View style={[styles.greeting, { top: insets.top + 24 }]} pointerEvents="none">
          <Text style={styles.greetingText}>{t('greeting')}</Text>
        </View>

        {/* 夜猫子场景推荐卡：结果板上方（不进固定 196 板内，独立悬浮） */}
        {nightOwlVisible ? (
          <View
            style={[
              styles.nudgeWrap,
              { bottom: Math.max(insets.bottom + space.x2, 92) + 196 + space.x3 },
            ]}
            pointerEvents="box-none"
          >
            <NightOwlRecommendCard
              slug={NIGHT_OWL_TARGET_SLUG}
              nightSessions={nightOwlStats(focus.history, Date.now()).nightSessions}
              onTap={() => navigate("store.skinDetail", { skinSlug: NIGHT_OWL_TARGET_SLUG })}
              onDismiss={dismissNightOwlCard}
            />
          </View>
        ) : null}

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
            <Text style={styles.boardEmpty}>{t('boardEmpty')}</Text>
          ) : (
            <View style={styles.statsRow}>
              <Text style={styles.statMain}>
                {t('todayMinutes', { n: focus.today.minutes })}
              </Text>
              <Text style={styles.statSub}>
                {t('doneSessions', { n: focus.today.sessions })}
              </Text>
            </View>
          )}
          <View style={styles.boardActions}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={active ? t('backToFocus') : t('startFocus')}
              onPress={active ? () => navigate("focus.active") : startFocus}
              reducedMotion={focus.reducedMotion}
              style={styles.primaryCta}
            >
              <Text style={styles.primaryCtaText}>{primaryLabel}</Text>
            </PressableScale>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={t('chooseActivity')}
              onPress={() => navigate("focus.setup")}
              reducedMotion={focus.reducedMotion}
              style={styles.selector}
            >
              <Text style={styles.selectorText}>{selectorLabel}</Text>
              <AppIcon
                name="chevron-down"
                color={palette.onMediaSecondary}
                size={18}
              />
            </PressableScale>
          </View>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (p: ThemeColors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: p.canvasDeep,
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
    // 直接压在皮肤影像上（无面板）：onMedia 固定浅色，两模式不翻转
    color: p.onMedia,
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
    // 底部结果板是媒体层玻璃（tabs 液态玻璃同语言）：固定暗玻璃透出画面动画，
    // 整组媒体层 token——onMedia 固定浅字，严禁混入随主题翻转的 token
    //（3.3 事故：暗玻璃底配主题文字 → 亮色下深字压暗底不可读）
    backgroundColor: semantic.mediaGlass,
    borderWidth: 1,
    borderColor: mediaBorderSoft,
    paddingHorizontal: space.x5,
    paddingVertical: space.x4,
    justifyContent: "space-between",
  },
  // 夜猫子推荐卡容器：与结果板同边距，悬于其上（不进固定板高）
  nudgeWrap: {
    position: "absolute",
    left: space.x4,
    right: space.x4,
  },
  boardEmpty: {
    ...type.body,
    color: p.onMediaSecondary,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  statMain: {
    ...type.title1,
    color: p.onMedia,
    fontVariant: ["tabular-nums"],
  },
  statSub: {
    ...type.body,
    color: p.onMediaSecondary,
    fontVariant: ["tabular-nums"],
  },
  boardActions: {
    gap: space.x3,
  },
  primaryCta: {
    minHeight: 52,
    borderRadius: radii.control,
    // 主 CTA 玻璃蓝：透出底层动画、与液态玻璃 tab 同语言（用户选定方向）
    backgroundColor: mediaActionGlass,
    borderWidth: 1,
    borderColor: mediaActionBorder,
    paddingHorizontal: space.x5,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryCtaText: {
    ...type.bodyStrong,
    // 玻璃蓝恒压在底部 scrim 的暗背景上（onMedia 白字对比 ≥6:1，两模式同值）
    color: p.onMedia,
  },
  selector: {
    minHeight: 48,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: mediaBorderSoft,
    paddingHorizontal: space.x4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectorText: {
    ...type.bodyStrong,
    color: p.onMedia,
  },
});
