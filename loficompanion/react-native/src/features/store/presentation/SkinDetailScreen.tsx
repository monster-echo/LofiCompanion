
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import {
  apiClient,
  ApiClientError,
  skinStatePosterUrl,
  skinStateVideoUrl,
} from '../../../data/apiClient';
import type { SkinProductRemote } from '../../../data/apiClient';
import { telemetry } from '../../../telemetry/Telemetry';
import { AppIcon } from '../../../design-system/AppIcon';
import { mediaActionBorder, mediaActionGlass } from '../../../design-system/derivedTokens';
import { createPaymentProvider } from '../../../payment/paymentFactory';
import { IapError } from '../../../payment/iapPaymentProvider';
import type { RootParamList } from '../../../navigation/navigationRef';
import { useApp } from '../../../state/AppStore';
import { usePreferences } from '../../../preferences/PreferencesProvider';
import { radii, space, type, type ThemeColors } from '../../../theme/tokens';
import { useThemeStyles } from '../../../theme/useThemeStyles';
import type { StorageDriver } from '../../focus/data/storageDriver';
import { useFocus } from '../../focus/application/FocusStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SheetOverlay } from '../../focus/presentation/SheetOverlay';
import { useAsyncRefresh } from '../../leaderboards/application/useAsyncRefresh';
import type { CompanionState } from '../../skins/domain/types';
import { findSkinManifestByIdOrSlug, skinDisplayName } from '../../skins/domain/registry';
import { SkinPackError } from '../../skins/application/skinPackController';
import { createPendingOrderRepository } from '../data/pendingOrderRepository';
import { useSkinTrials } from '../application/SkinTrialProvider';
import {
  formatPrice,
  isWithinWindow,
  newSkinOrderIdempotencyKey,
  resolveRecovery,
} from '../domain/storeCatalog';
import { useTranslation } from 'react-i18next';
import { i18n } from '../../../i18n/core';
import {
  DETAIL_PREVIEW_STATES,
  storeLoopVideo,
  storePoster,
} from './storePosters';
import { DetailPreviewVideo } from './DetailPreviewVideo';

/**
 * S15 皮肤详情与购买（doc-08 §16，P1-A Task 3）。push 页、未登录可浏览：
 * 顶部媒体预览 390 可切 ready/focus/drink/complete 四态；信息区依次为
 * 名称 / 官方标识 / 状态数 / 商用说明；价格来自服务端（加载中按钮骨架不可
 * 点）。主 CTA：paid →「$X 永久解锁」（确认 sheet → 幂等下单 → 按订单
 * provider 走原生 IAP 验证 → 解锁反馈）；premium →「加入 Plus」（Plus 订阅
 * 流未上线，点击给「即将上线」反馈——偏离已记录）；已拥有未物化 →「下载
 * 资源包并使用」（资源包按需模型：CTA 原位变内联进度条，完成自动选入回
 * 首页）；已物化 →「立即使用」。购买 pending 防重复点击；中断（网络/进程
 * 终止）后凭本地 lastOrderId 记录在下次进入时轮询查单恢复终态（docs/05 §5）；
 * 记录按下单账号隔离，查单 404（跨账号残留死单）视为终态清除。
 */

const PREVIEW_HEIGHT = 390;
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 10;

// 与 FocusStore 相同的 AsyncStorage 适配（仅本页待完成订单记录）
const storageDriver: StorageDriver = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  remove: (key) => AsyncStorage.removeItem(key),
};
const pendingOrders = createPendingOrderRepository(storageDriver);

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

type CtaPhase = 'idle' | 'purchasing' | 'recovering';

export function SkinDetailScreen() {
  const { params } = useRoute<RouteProp<RootParamList, 'store.skinDetail'>>();
  const skinSlug = params?.skinSlug ?? '';
  const { user, navigate, back, showToast } = useApp();
  const focus = useFocus();
  const trials = useSkinTrials();
  const { locale, palette } = usePreferences();
  const { t } = useTranslation('store');
  const styles = useThemeStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const signedIn = user !== null;
  const { width: windowWidth } = useWindowDimensions();

  const [ownedKeys, setOwnedKeys] = useState<readonly string[]>([]);
  const [previewState, setPreviewState] = useState<CompanionState>('ready');
  // 公开海报加载失败（离线/未发布）：退回占位，不留破图/黑块
  const [previewFailed, setPreviewFailed] = useState(false);
  const [ctaPhase, setCtaPhase] = useState<CtaPhase>('idle');
  const [sheetOpen, setSheetOpen] = useState(false);
  const mountedRef = useRef(true);

  const { state, reload } = useAsyncRefresh(async () => {
    // 价格目录公开；权益仅登录后拉取（失败按未拥有降级，不阻塞页面）
    let keys: readonly string[] = [];
    if (signedIn) {
      // 会员键（auth）∪ 皮肤键（biz）聚合
      try { keys = await apiClient.ownedEntitlementKeys(); } catch { /* 降级 */ }
      // 试用记录对账（服务端是「试过没有」的唯一真相；失败保持保守）
      void apiClient.skinTrials()
        .then(({ trials: records }) => trials.reconcileFromServer(records))
        .catch(() => undefined);
    }
    setOwnedKeys(keys);
    const { products } = await apiClient.skinProducts();
    return products;
  }, [skinSlug, signedIn]);

  const productReady = state.status === 'ready';
  const product: SkinProductRemote | null = productReady
    ? state.data.find((item) => item.slug === skinSlug) ?? null
    : null;

  // 目录外皮肤 = 本地内置免费（已拥有）；其余按权益键判定
  const owned = !product
    || product.accessType === 'free'
    || ownedKeys.includes(product.entitlementKey);
  // Plus 会员价（展示口径）：Plus 用户 + 限时窗口内 + 服务端配置了折扣 SKU。
  // 实际扣款由服务端按 Plus 身份选 SKU——显示价与扣款价同口径。
  const isPlus = ownedKeys.includes('catalog.premium.active');
  const plusPriceLabel = product
    && product.accessType === 'paid'
    && isPlus
    && isWithinWindow(product, Date.now())
    && product.plusPriceMinor != null
    ? formatPrice(product.plusPriceMinor, product.currency)
    : null;
  const priceLabel = product && product.accessType === 'paid'
    ? plusPriceLabel ?? formatPrice(product.priceMinor, product.currency)
    : null;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // 换皮肤/切预览态：清除海报失败标记，给新的公开海报一次加载机会
  useEffect(() => { setPreviewFailed(false); }, [skinSlug, previewState]);

  // —— 中断恢复（docs/05 §5）：进入详情时查本地 lastOrderId，轮询查单恢复终态
  const runRecovery = useCallback(async () => {
    if (!signedIn || !user) return;
    let orderId: string | null = null;
    try { orderId = await pendingOrders.load(skinSlug, user.id); } catch { return; }
    if (!orderId) return;
    setCtaPhase('recovering');
    showToast(t('recoveryFound'), 'info');
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
      await sleep(POLL_INTERVAL_MS);
      if (!mountedRef.current) return;
      try {
        const order = await apiClient.getSkinOrder(orderId);
        const verdict = resolveRecovery(order);
        if (verdict === 'unlocked') {
          await pendingOrders.clear(skinSlug);
          setOwnedKeys((keys) => keys.includes(order.entitlementKey)
            ? keys
            : [...keys, order.entitlementKey]);
          showToast(t('recoveryDone'), 'success');
          setCtaPhase('idle');
          return;
        }
        if (verdict === 'failed') {
          await pendingOrders.clear(skinSlug);
          showToast(t('purchaseFailed'), 'error');
          setCtaPhase('idle');
          return;
        }
      } catch (error) {
        // 404 = 订单不存在或不属于当前账号（跨账号/跨环境的本地残留）：
        // 恢复无意义，清记录终止——否则每次进页无限轮询同一死单
        if (error instanceof ApiClientError && error.status === 404) {
          await pendingOrders.clear(skinSlug).catch(() => undefined);
          if (mountedRef.current) setCtaPhase('idle');
          return;
        }
        /* 网络/服务波动，继续下一轮 */
      }
    }
    // 轮询到上限仍非终态：保留本地记录，下次进入继续恢复
    if (mountedRef.current) {
      showToast(t('recoveryStuck'), 'info');
      setCtaPhase('idle');
    }
  }, [showToast, signedIn, user, skinSlug]);

  useEffect(() => { void runRecovery(); }, [runRecovery]);

  // —— 购买流（对齐 useDataActions.purchase 范式）：幂等下单 → 记录 lastOrderId →
  // 按订单 provider 选 mock/原生 IAP → 验证 → 权益入账后 finish → 解锁反馈
  const confirmPurchase = useCallback(async (target: SkinProductRemote) => {
    if (!user) return; // 入口（CTA/sheet）已强制登录，此处兜底收窄类型
    setSheetOpen(false);
    setCtaPhase('purchasing');
    // 皮肤购买漏斗（本路径绕过 run()，此前购买失败/取消在遥测里零痕迹）
    telemetry.track('purchase_initiated', {
      plan_id: target.skinId, platform: Platform.OS, kind: 'skin',
    });
    try {
      const order = await apiClient.createSkinOrder(
        target.skinId,
        newSkinOrderIdempotencyKey(),
      );
      await pendingOrders.save(skinSlug, order.orderId, user.id);
      const provider = createPaymentProvider(order);
      let result;
      try {
        result = await provider.purchase(order.storeProductId);
      } catch (error) {
        // 用户取消购买：静默回 idle，清本地记录（服务端 pending 单无害）
        if (error instanceof IapError && error.kind === 'cancelled') {
          telemetry.track('purchase_cancelled', {
            plan_id: target.skinId, platform: Platform.OS, kind: 'skin',
          });
          await pendingOrders.clear(skinSlug).catch(() => undefined);
          return;
        }
        throw error;
      }
      const verified = await apiClient.verifySkinOrder(order.orderId, result.receipt);
      if (verified.status === 'success') {
        // 权益已入账后才 finish 交易（未 finish 的交易可自愈重试）
        await provider.finish?.(result).catch(() => undefined);
        await pendingOrders.clear(skinSlug);
        // 试用中购买：收尾试用记录（purchased），皮肤保留不回落
        void trials.markEnded(skinSlug, 'purchased');
        setOwnedKeys((keys) => keys.includes(target.entitlementKey)
          ? keys
          : [...keys, target.entitlementKey]);
        telemetry.track('purchase_success', {
          plan_id: target.skinId, platform: Platform.OS, order_id: order.orderId, kind: 'skin',
        });
        showToast(t('purchaseSuccess'), 'success');
      } else {
        await pendingOrders.clear(skinSlug);
        telemetry.track('purchase_failed', {
          plan_id: target.skinId, platform: Platform.OS, order_id: order.orderId,
          reason: 'verify_failed', kind: 'skin',
        });
        showToast(t('purchaseFailed'), 'error');
      }
    } catch (error) {
      // iap 错误带原始 message（截 180）：iap_unavailable 只是分类，定位需要
      // 原生层真实报错（模块缺失 / SKU 不可用 / 参数被拒是三种完全不同的修法）
      if (error instanceof IapError) {
        console.warn('[purchase] IAP error:', error.kind, error.message);
      }
      telemetry.track('purchase_failed', {
        plan_id: target.skinId, platform: Platform.OS,
        reason: error instanceof IapError ? `iap_${error.kind}`
          : error instanceof ApiClientError ? (error.status === 0 ? 'offline' : 'api_error')
            : 'exception',
        ...(error instanceof IapError
          ? { error_message: error.message.slice(0, 180) } : {}),
        kind: 'skin',
      });
      // 中断：本地记录保留，下次进入本页自动恢复终态（CTA 期间已防重复点击）
      showToast(t('recoveryStuck'), 'info');
    } finally {
      setCtaPhase('idle');
    }
  }, [showToast, user, skinSlug, trials]);

  // 恢复购买：模板 restore 端点按 active entitlements 返回键（皮肤键自然包含）
  const restorePurchases = useCallback(async () => {
    setSheetOpen(false);
    if (!signedIn) {
      navigate('auth.signIn');
      return;
    }
    try {
      const provider = createPaymentProvider({
        provider: Platform.OS === 'ios' ? 'apple' : 'google',
      });
      const receipts = (await provider.restore()).map((item) => item.receipt);
      const { entitlements } = await apiClient.restoreSkinPurchases(receipts);
      setOwnedKeys((keys) => {
        const merged = new Set(keys);
        for (const key of entitlements) merged.add(key);
        return [...merged];
      });
      const recovered = product !== null && entitlements.includes(product.entitlementKey);
      showToast(recovered ? t('restoreDone') : t('restoreNone'), 'info');
    } catch {
      showToast(t('loadFailed'), 'error');
    }
  }, [navigate, product, showToast, signedIn]);

  // —— 资源包按需下载（资源包模型）：已拥有但未物化 → CTA「下载资源包并使用」。
  // 进度真源是 pack controller（useSyncExternalStore 订阅）；中途退页下载继续，
  // 重进本页自动重挂进度。成功且页面仍挂载才自动选入并回首页。
  const packStatus = useSyncExternalStore(
    focus.pack.subscribe,
    () => focus.pack.statusFor(skinSlug),
  );
  const materialized = findSkinManifestByIdOrSlug(focus.skins, skinSlug) !== undefined;
  const packDownloading = packStatus.phase === 'downloading';
  const packFailed = packStatus.phase === 'failed';
  const packPercent = Math.round(packStatus.ratio * 100);

  const startDownload = useCallback(() => {
    void focus.actions.downloadSkinPack(skinSlug)
      .then((manifest) => {
        if (!mountedRef.current) return;
        focus.actions.selectSkin(manifest.id);
        back();
        showToast(t('packDone'), 'success');
      })
      .catch((error: unknown) => {
        if (!mountedRef.current) return;
        const kind = error instanceof SkinPackError ? error.kind : 'manifest';
        if (kind === 'gated') showToast(t('packGated'), 'info');
        else if (kind === 'busy') showToast(t('packBusy'), 'info');
        else showToast(t('packFailed'), 'error');
      });
  }, [back, focus.actions, showToast, skinSlug, t]);

  // 已拥有且已物化：注册表（内置+已获资源包）内的皮肤直接应用并回首页
  const useOwnedSkin = useCallback(() => {
    const manifest = findSkinManifestByIdOrSlug(focus.skins, skinSlug);
    if (!manifest) return;
    focus.actions.selectSkin(manifest.id);
    back();
  }, [back, focus.actions, skinSlug]);

  // —— 免费试用（24h 随便用，每皮肤限一次；服务端 409 是「试过」的兜底）——
  // 开启成功即记录（fallbackSkinId = 当前皮肤，供到期回落）并自动链资源包
  // 下载（门禁已放行），完成后原下载回调自动选入回首页。
  const startTrial = useCallback(() => {
    if (!signedIn) {
      showToast(t('trialSignIn'), 'info');
      navigate('auth.signIn');
      return;
    }
    if (!product) return;
    void (async () => {
      try {
        const result = await apiClient.startSkinTrial(product.skinId);
        if (result.status === 'owned') {
          setOwnedKeys((keys) => keys.includes(product.entitlementKey)
            ? keys
            : [...keys, product.entitlementKey]);
          return;
        }
        const expiresAtUtc = Date.parse(result.expiresAt);
        if (Number.isNaN(expiresAtUtc)) {
          showToast(t('trialFailed'), 'error');
          return;
        }
        await trials.markStarted({
          slug: skinSlug,
          expiresAtUtc,
          fallbackSkinId: focus.selectedSkinId,
        });
        showToast(t('trialStartedToast'), 'success');
        startDownload();
      } catch (error) {
        if (error instanceof ApiClientError && error.code === 'SKIN_TRIAL_ALREADY_USED') {
          showToast(t('trialUsedNote'), 'info');
        } else {
          showToast(t('trialFailed'), 'error');
        }
      }
    })();
  }, [focus.selectedSkinId, navigate, product, signedIn, skinSlug, startDownload, showToast, t, trials]);

  // 试用状态：'active' → CTA 变「试用中·使用/下载」；'none' → 出「免费试 24 小时」
  const trialStatus = trials.statusFor(skinSlug);

  const previewPoster = storePoster(focus.skins, skinSlug, previewState)
    // 未购/未拉取的皮肤清单不在本地：四态全部用公开海报兜底（服务端请求态
    // 缺失自动回落 ready），占位图只剩离线/未发布的最终兜底
    ?? { uri: skinStatePosterUrl(skinSlug, previewState) };
  // 预览视频：已物化用本地文件，未物化走公开预览视频端点（该态无视频时
  // 服务端 404 → expo-video 停在透明态，海报静图兜底）
  const previewVideo = storeLoopVideo(focus.skins, skinSlug, previewState)
    ?? { uri: skinStateVideoUrl(skinSlug, previewState) };
  // 信息区状态数：皮肤清单已就位时用真实状态数
  const skinManifest = findSkinManifestByIdOrSlug(focus.skins, skinSlug);
  const previewWidth = windowWidth;

  const busy = ctaPhase !== 'idle';

  return (
    <View style={styles.screen}>
      {/* App bar 56（避让状态栏）：返回 44×44，标题居中 */}
      <View style={[styles.header, { paddingTop: insets.top, height: 48 + insets.top }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={i18n.t('common:back')}
          onPress={back}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <AppIcon name="arrow-left" color={palette.textPrimary} size={22} />
        </Pressable>
        {/* 绝对定位标题须显式锚定 top（Yoga 对无 top 的绝对子元素不再居中，会贴 padding 原点=灵动岛下） */}
        <Text style={[styles.headerTitle, { top: insets.top, lineHeight: 48 }]}>{t('appBarTitle')}</Text>
      </View>

      {state.status === 'error' ? (
        <View style={styles.stateArea}>
          <AppIcon name="alert" color={palette.warning} size={28} />
          <Text style={styles.stateText}>{state.message}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('retry')}
            onPress={reload}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          >
            <Text style={styles.retryText}>{t('retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* 媒体预览 390（doc-08 §16）：海报四态公开兜底 + loop 视频叠层；占位
              仅剩离线/未发布的最终兜底（不用虚构截图） */}
          <View style={[styles.preview, { width: previewWidth, height: PREVIEW_HEIGHT }]}>
            {previewPoster && !previewFailed ? (
              <Image
                source={previewPoster}
                onError={() => setPreviewFailed(true)}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: previewWidth,
                  height: PREVIEW_HEIGHT,
                }}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.previewPlaceholder}>
                <AppIcon name="image" color={palette.textMuted} size={32} />
                <Text style={styles.previewPlaceholderText}>
                  {t(previewState === 'focusing' ? 'stateFocusing' : previewState === 'drinking' ? 'stateDrinking' : previewState === 'completed' ? 'stateCompleted' : 'stateReady')} · {t('previewCaption', { state: '' })}
                </Text>
              </View>
            )}
            {/* 氛围预览：静音 loop 视频（本地文件或公开端点）；减少动态用户与
                下载进行中（进度条覆盖）不挂载，省电省流量 */}
            {!focus.reducedMotion && !packDownloading ? (
              <DetailPreviewVideo
                source={previewVideo}
                active
                width={previewWidth}
                height={PREVIEW_HEIGHT}
              />
            ) : null}
          </View>

          {/* 四态切换 segmented control */}
          <View style={styles.stateSwitch}>
            {DETAIL_PREVIEW_STATES.map((item) => {
              const selected = item === previewState;
              return (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityLabel={t('previewStateA11y', { state: item })}
                  accessibilityState={{ selected }}
                  onPress={() => setPreviewState(item)}
                  style={({ pressed }) => [
                    styles.stateChip,
                    selected && styles.stateChipActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[styles.stateChipText, selected && styles.stateChipTextActive]}
                  >
                    {t(item === 'focusing' ? 'stateFocusing' : item === 'drinking' ? 'stateDrinking' : item === 'completed' ? 'stateCompleted' : 'stateReady')}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* 信息区：名称 → 官方标识 → 状态数 → 音轨 → 离线大小 → 商用说明 */}
          <View style={styles.infoCard}>
            <View style={styles.nameRow}>
              <Text style={styles.skinName}>
                {product
                  // 服务端 skin_name 单语（中文）：官方皮肤 slug 走 i18n 渲染期翻译
                  ? i18n.t(`store:skinNames.${product.slug}`, { defaultValue: product.skinName })
                  : (() => { const m = findSkinManifestByIdOrSlug(focus.skins, skinSlug); return m ? skinDisplayName(m, locale) : focus.skin.name; })()}
              </Text>
            </View>
            <View style={styles.creatorRow}>
              <AppIcon name="crown" color={palette.membershipGold} size={16} />
              <Text style={styles.creatorText}>{t('officialCreator')}</Text>
            </View>
            {skinManifest ? (
              <InfoRow label={t('includesStates')} value={t('stateCount', { n: skinManifest.states.length })} />
            ) : null}
            <Text style={styles.commercialNote}>{t('commercialNote')}</Text>
          </View>
        </ScrollView>
      )}

      {/* 底部主 CTA（避让 Home 条）：价格加载中骨架不可点；pending 防重复点击；
          下载中 CTA 原位变内联进度条（资源包模型） */}
      <View style={[styles.ctaArea, { paddingBottom: space.x3 + insets.bottom }]}>
        {!productReady ? (
          <View style={styles.ctaSkeleton} accessibilityLabel={t('priceLoading')}>
            <Text style={styles.ctaSkeletonText}>{t('priceLoading')}</Text>
          </View>
        ) : busy ? (
          <View style={styles.ctaSkeleton} accessibilityLabel={t('processing')}>
            <Text style={styles.ctaSkeletonText}>{t('processing')}</Text>
          </View>
        ) : packDownloading ? (
          <View
            style={styles.packProgress}
            accessibilityLabel={t('packDownloadingA11y')}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: packPercent }}
          >
            <View style={styles.packProgressTrack}>
              <View style={[styles.packProgressFill, { width: `${packPercent}%` }]} />
            </View>
            <Text style={styles.packProgressText}>
              {t('packProgress', {
                percent: packPercent,
                done: packStatus.assetsDone,
                total: packStatus.assetsTotal,
              })}
            </Text>
          </View>
        ) : !owned ? (
          trialStatus === 'active' ? (
            // 试用中（24h 窗口）：未物化走资源包下载（门禁已放行），已物化直接用
            !materialized ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={packFailed ? t('downloadRetry') : t('downloadPackCta')}
                onPress={startDownload}
                style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
              >
                <AppIcon
                  name={packFailed ? 'alert' : 'palette'}
                  color={palette.textPrimary}
                  size={18}
                />
                <Text style={styles.ctaText}>{packFailed ? t('downloadRetry') : t('downloadPackCta')}</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('trialActiveUse')}
                onPress={useOwnedSkin}
                style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
              >
                <AppIcon name="check" color={palette.textPrimary} size={18} />
                <Text style={styles.ctaText}>{t('trialActiveUse')}</Text>
              </Pressable>
            )
          ) : product.accessType === 'premium' ? (
            // 偏离记录：Plus 订阅流未上线（模板 membership 页为演示态）——
            // 点击只给「即将上线」反馈，不发起购买（docs/08 §16 主 CTA 语义保留）
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('joinPlus')}
              onPress={() => showToast(t('plusComingSoon'), 'info')}
              style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
            >
              <AppIcon name="crown" color={palette.textPrimary} size={18} />
              <Text style={styles.ctaText}>{t('joinPlus')}</Text>
            </Pressable>
          ) : (
            <View style={styles.ctaColumn}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={priceLabel ? t('unlockForever', priceLabel) : ''}
                onPress={() => {
                  if (!signedIn) {
                    // docs/08 §15：未登录可浏览，购买时进入登录
                    showToast(t('signInRequired'), 'info');
                    navigate('auth.signIn');
                    return;
                  }
                  setSheetOpen(true);
                }}
                style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
              >
                <Text style={styles.ctaText}>
                  {priceLabel ? t('unlockForever', { price: priceLabel }) : t('priceLoading')}
                </Text>
              </Pressable>
              {/* 免费试 24 小时（仅服务端确认未试过时出——'unknown' 保守隐藏） */}
              {trialStatus === 'none' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('trialCta')}
                  onPress={startTrial}
                  style={({ pressed }) => [styles.sheetRestore, pressed && styles.pressed]}
                >
                  <Text style={styles.sheetRestoreText}>{t('trialCta')}</Text>
                </Pressable>
              ) : null}
            </View>
          )
        ) : !materialized ? (
          // 已拥有（免费/已购）但资源包未落地：首次点击下载，失败重试只补缺
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={packFailed ? t('downloadRetry') : t('downloadPackCta')}
            onPress={startDownload}
            style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
          >
            <AppIcon
              name={packFailed ? 'alert' : 'palette'}
              color={palette.textPrimary}
              size={18}
            />
            <Text style={styles.ctaText}>{packFailed ? t('downloadRetry') : t('downloadPackCta')}</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('ownedUse')}
            onPress={useOwnedSkin}
            style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
          >
            <AppIcon name="check" color={palette.textPrimary} size={18} />
            <Text style={styles.ctaText}>{t('ownedUse')}</Text>
          </Pressable>
        )}
      </View>

      {/* 购买确认 sheet：商品 / 价格 / 永久属性 + 恢复购买入口（doc-08 §16/§21） */}
      {sheetOpen && product ? (
        <SheetOverlay onClose={() => setSheetOpen(false)} bottomInset={insets.bottom}>
          <Text style={styles.sheetTitle}>{t('confirmTitle')}</Text>
          <View style={styles.sheetRows}>
            <InfoRow
              label={t('confirmProduct')}
              value={i18n.t(`store:skinNames.${product.slug}`, { defaultValue: product.skinName })}
            />
            <InfoRow label={t('confirmPrice')} value={priceLabel ?? ''} />
            {plusPriceLabel ? (
              <InfoRow label={t('confirmPlusPrice')} value={plusPriceLabel} />
            ) : null}
            <InfoRow label={t('confirmType')} value={t('confirmPermanent')} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('confirmPay')}
            onPress={() => void confirmPurchase(product)}
            style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
          >
            <Text style={styles.ctaText}>{t('confirmPay')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('restorePurchases')}
            onPress={() => void restorePurchases()}
            style={({ pressed }) => [styles.sheetRestore, pressed && styles.pressed]}
          >
            <Text style={styles.sheetRestoreText}>{t('restorePurchases')}</Text>
          </Pressable>
        </SheetOverlay>
      ) : null}
    </View>
  );
}

function InfoRow({ label, value }: Readonly<{ label: string; value: string }>) {
  const styles = useThemeStyles(makeStyles);
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

// RN 0.86 已移除 StyleSheet.absoluteFillObject，统一用显式填充。
// Fabric 下 Image 不吃「仅四边 inset」的 absolute 定位（会回退固有尺寸糊图），
// 须显式给宽高（见 ImmersiveMediaSurface）
const absoluteFill = {
  position: 'absolute' as const,
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
} as const;

const makeStyles = (p: ThemeColors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: p.canvas,
  },
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.x2,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...type.title2,
    color: p.textPrimary,
    position: 'absolute',
    left: 88,
    right: 88,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: space.x5,
  },
  preview: {
    backgroundColor: p.surfaceRaised,
  },
  previewPlaceholder: {
    ...absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.x2,
    paddingHorizontal: space.x6,
  },
  previewPlaceholderText: {
    ...type.caption,
    color: p.textMuted,
    textAlign: 'center',
  },
  stateSwitch: {
    flexDirection: 'row',
    gap: space.x2,
    paddingHorizontal: space.x4,
    marginTop: space.x3,
  },
  stateChip: {
    flex: 1,
    minHeight: 40,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: p.borderStandard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateChipActive: {
    borderColor: p.actionFocus,
    backgroundColor: p.brandSoft,
  },
  stateChipText: {
    ...type.label,
    color: p.textSecondary,
  },
  stateChipTextActive: {
    color: p.actionFocus,
  },
  infoCard: {
    marginTop: space.x4,
    marginHorizontal: space.x4,
    borderRadius: radii.card,
    backgroundColor: p.surface,
    borderWidth: 1,
    borderColor: p.borderSoft,
    padding: space.x4,
    gap: space.x3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  skinName: {
    ...type.title1,
    color: p.textPrimary,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x1,
  },
  creatorText: {
    ...type.label,
    color: p.membershipGold,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.x4,
  },
  infoLabel: {
    ...type.body,
    color: p.textMuted,
  },
  infoValue: {
    ...type.body,
    color: p.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
  commercialNote: {
    ...type.caption,
    color: p.textMuted,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: p.borderSoft,
    paddingTop: space.x3,
  },
  ctaArea: {
    paddingHorizontal: space.x4,
    paddingBottom: space.x3,
  },
  cta: {
    minHeight: 52,
    borderRadius: radii.control,
    // 主 CTA 玻璃蓝：与首页同语言（半透明雨蓝+浅蓝描边），前景随主题翻转
    backgroundColor: mediaActionGlass,
    borderWidth: 1,
    borderColor: mediaActionBorder,
    paddingHorizontal: space.x5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.x2,
  },
  ctaText: {
    ...type.bodyStrong,
    color: p.textPrimary,
  },
  ctaSkeleton: {
    minHeight: 52,
    borderRadius: radii.control,
    backgroundColor: p.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.7,
  },
  ctaSkeletonText: {
    ...type.bodyStrong,
    color: p.textMuted,
  },
  packProgress: {
    minHeight: 52,
    borderRadius: radii.control,
    backgroundColor: p.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.x2,
    paddingHorizontal: space.x4,
    paddingVertical: space.x2,
  },
  packProgressTrack: {
    alignSelf: 'stretch',
    height: 6,
    borderRadius: radii.small,
    backgroundColor: p.borderSoft,
    overflow: 'hidden',
  },
  packProgressFill: {
    height: '100%',
    borderRadius: radii.small,
    backgroundColor: p.actionPrimary,
  },
  packProgressText: {
    ...type.caption,
    color: p.textSecondary,
  },
  // 付费主 CTA + 试用次级按钮的纵排容器
  ctaColumn: {
    gap: space.x2,
    alignSelf: 'stretch',
  },
  sheetTitle: {
    ...type.title3,
    color: p.textPrimary,
    textAlign: 'center',
    marginBottom: space.x3,
  },
  sheetRows: {
    gap: space.x3,
    marginBottom: space.x4,
  },
  sheetRestore: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.x2,
  },
  sheetRestoreText: {
    ...type.bodyStrong,
    color: p.actionFocus,
  },
  stateArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.x3,
    paddingHorizontal: space.x6,
  },
  stateText: {
    ...type.body,
    color: p.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 44,
    paddingHorizontal: space.x5,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: p.borderStandard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    ...type.bodyStrong,
    color: p.textPrimary,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});
