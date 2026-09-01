
  const { t } = useTranslation('store');import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { apiClient } from '../../../data/apiClient';
import type { SkinProductRemote } from '../../../data/apiClient';
import { AppIcon } from '../../../design-system/AppIcon';
import { MockPaymentProvider } from '../../../payment/mockPaymentProvider';
import type { RootParamList } from '../../../navigation/navigationRef';
import { useApp } from '../../../state/AppStore';
import { colors, radii, semantic, space, type } from '../../../theme/tokens';
import type { StorageDriver } from '../../focus/data/storageDriver';
import { useFocus } from '../../focus/application/FocusStore';
import { SheetOverlay } from '../../focus/presentation/SheetOverlay';
import { useAsyncRefresh } from '../../leaderboards/application/useAsyncRefresh';
import type { CompanionState } from '../../skins/domain/types';
import { findSkinManifestByIdOrSlug } from '../../skins/domain/registry';
import { createPendingOrderRepository } from '../data/pendingOrderRepository';
import {
  formatPrice,
  newSkinOrderIdempotencyKey,
  resolveRecovery,
} from '../domain/storeCatalog';
import { useTranslation } from 'react-i18next';
import {
  DETAIL_PREVIEW_STATES,
  PREVIEW_STATE_LABELS,
  storePoster,
} from './storePosters';

/**
 * S15 皮肤详情与购买（doc-08 §16，P1-A Task 3）。push 页、未登录可浏览：
 * 顶部媒体预览 390 可切 ready/focus/drink/complete 四态；信息区依次为
 * 名称 / 官方标识 / 状态数 / 音轨 / 离线大小（估算）/ 商用说明；价格来自
 * 服务端（加载中按钮骨架不可点）。主 CTA：paid →「¥X 永久解锁」（确认
 * sheet → 幂等下单 → mock 验证 → 解锁反馈）；premium →「加入 Plus」（Plus
 * 订阅流未上线，点击给「即将上线」反馈——偏离已记录）；已拥有 →「立即使用」。
 * 购买 pending 防重复点击；中断（网络/进程终止）后凭本地 lastOrderId 记录
 * 在下次进入时轮询查单恢复终态（docs/05 §5）。
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
  const signedIn = user !== null;
  const { width: windowWidth } = useWindowDimensions();

  const [ownedKeys, setOwnedKeys] = useState<readonly string[]>([]);
  const [previewState, setPreviewState] = useState<CompanionState>('ready');
  const [ctaPhase, setCtaPhase] = useState<CtaPhase>('idle');
  const [sheetOpen, setSheetOpen] = useState(false);
  const mountedRef = useRef(true);

  const { state, reload } = useAsyncRefresh(async () => {
    // 价格目录公开；权益仅登录后拉取（失败按未拥有降级，不阻塞页面）
    let keys: readonly string[] = [];
    if (signedIn) {
      try { keys = (await apiClient.entitlements()).keys; } catch { /* 降级 */ }
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
  const priceLabel = product && product.accessType === 'paid'
    ? formatPrice(product.priceMinor, product.currency)
    : null;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // —— 中断恢复（docs/05 §5）：进入详情时查本地 lastOrderId，轮询查单恢复终态
  const runRecovery = useCallback(async () => {
    if (!signedIn) return;
    let orderId: string | null = null;
    try { orderId = await pendingOrders.load(skinSlug); } catch { return; }
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
      } catch { /* 网络/服务波动，继续下一轮 */ }
    }
    // 轮询到上限仍非终态：保留本地记录，下次进入继续恢复
    if (mountedRef.current) {
      showToast(t('recoveryStuck'), 'info');
      setCtaPhase('idle');
    }
  }, [showToast, signedIn, skinSlug]);

  useEffect(() => { void runRecovery(); }, [runRecovery]);

  // —— 购买流：幂等下单 → 记录 lastOrderId → mock 支付 → 验证 → 解锁反馈
  const confirmPurchase = useCallback(async (target: SkinProductRemote) => {
    setSheetOpen(false);
    setCtaPhase('purchasing');
    try {
      const order = await apiClient.createSkinOrder(
        target.skinId,
        newSkinOrderIdempotencyKey(),
      );
      await pendingOrders.save(skinSlug, order.orderId);
      const provider = new MockPaymentProvider();
      const result = await provider.purchase(target.id);
      const verified = await apiClient.verifyPurchase(order.orderId, result.receipt);
      if (verified.status === 'success') {
        await pendingOrders.clear(skinSlug);
        setOwnedKeys((keys) => keys.includes(target.entitlementKey)
          ? keys
          : [...keys, target.entitlementKey]);
        showToast(t('purchaseSuccess'), 'success');
      } else {
        await pendingOrders.clear(skinSlug);
        showToast(t('purchaseFailed'), 'error');
      }
    } catch {
      // 中断：本地记录保留，下次进入本页自动恢复终态（CTA 期间已防重复点击）
      showToast(t('recoveryStuck'), 'info');
    } finally {
      setCtaPhase('idle');
    }
  }, [showToast, skinSlug]);

  // 恢复购买：模板 restore 端点按 active entitlements 返回键（皮肤键自然包含）
  const restorePurchases = useCallback(async () => {
    setSheetOpen(false);
    if (!signedIn) {
      navigate('auth.signIn');
      return;
    }
    try {
      const provider = new MockPaymentProvider();
      const receipts = (await provider.restore()).map((item) => item.receipt);
      const { entitlements } = await apiClient.restore(receipts);
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

  // 已拥有：注册表（内置+已下载远端）内的皮肤直接应用并回首页；仍缺失时
  // 先触发一轮远端拉取再重试一次（购买后清单尚未就位的场景），还不行才
  // 诚实反馈而非静默失败。
  const useOwnedSkin = useCallback(() => {
    const apply = (): boolean => {
      const manifest = findSkinManifestByIdOrSlug(focus.skins, skinSlug);
      if (!manifest) return false;
      focus.actions.selectSkin(manifest.id);
      back();
      return true;
    };
    if (apply()) return;
    focus.actions.refreshSkins(signedIn);
    // 拉取是异步的：给一轮事件循环后重试（P0 简化，不引入 loading 态）
    setTimeout(() => {
      if (!apply()) showToast(t('manifestPending'), 'info');
    }, 1500);
  }, [back, focus.actions, showToast, skinSlug, signedIn]);

  const previewPoster = storePoster(skinSlug, previewState);
  const previewWidth = windowWidth;

  const busy = ctaPhase !== 'idle';

  return (
    <View style={styles.screen}>
      {/* App bar 56：返回 44×44，标题居中 */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          onPress={back}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <AppIcon name="arrow-left" color={semantic.textPrimary} size={22} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('appBarTitle')}</Text>
      </View>

      {state.status === 'error' ? (
        <View style={styles.stateArea}>
          <AppIcon name="alert" color={colors.warning} size={28} />
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
          {/* 媒体预览 390（doc-08 §16）；无本地海报的皮肤渲染占位，不用虚构截图 */}
          <View style={[styles.preview, { width: previewWidth, height: PREVIEW_HEIGHT }]}>
            {previewPoster ? (
              <Image
                source={previewPoster}
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
                <AppIcon name="image" color={semantic.textMuted} size={32} />
                <Text style={styles.previewPlaceholderText}>
                  {PREVIEW_STATE_LABELS[previewState]} · 状态预览以上线资源为准
                </Text>
              </View>
            )}
          </View>

          {/* 四态切换 segmented control */}
          <View style={styles.stateSwitch}>
            {DETAIL_PREVIEW_STATES.map((item) => {
              const selected = item === previewState;
              return (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityLabel={`预览${PREVIEW_STATE_LABELS[item]}状态`}
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
                    {PREVIEW_STATE_LABELS[item]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* 信息区：名称 → 官方标识 → 状态数 → 音轨 → 离线大小 → 商用说明 */}
          <View style={styles.infoCard}>
            <View style={styles.nameRow}>
              <Text style={styles.skinName}>
                {product?.skinName ?? findSkinManifestByIdOrSlug(focus.skins, skinSlug)?.name ?? focus.skin.name}
              </Text>
            </View>
            <View style={styles.creatorRow}>
              <AppIcon name="crown" color={colors.membershipGold} size={16} />
              <Text style={styles.creatorText}>{t('officialCreator')}</Text>
            </View>
            <InfoRow label="包含状态" value={t('stateCount', { n: 6 })} />
            <InfoRow label="音轨" value={t('audioTrack')} />
            <InfoRow label="离线大小" value={t('offlineSize')} />
            <Text style={styles.commercialNote}>{t('commercialNote')}</Text>
          </View>
        </ScrollView>
      )}

      {/* 底部主 CTA：价格加载中骨架不可点；pending 防重复点击 */}
      <View style={styles.ctaArea}>
        {!productReady ? (
          <View style={styles.ctaSkeleton} accessibilityLabel={t('priceLoading')}>
            <Text style={styles.ctaSkeletonText}>{t('priceLoading')}</Text>
          </View>
        ) : busy ? (
          <View style={styles.ctaSkeleton} accessibilityLabel={t('processing')}>
            <Text style={styles.ctaSkeletonText}>{t('processing')}</Text>
          </View>
        ) : owned ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('ownedUse')}
            onPress={useOwnedSkin}
            style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
          >
            <AppIcon name="check" color={semantic.canvasDeep} size={18} />
            <Text style={styles.ctaText}>{t('ownedUse')}</Text>
          </Pressable>
        ) : product.accessType === 'premium' ? (
          // 偏离记录：Plus 订阅流未上线（模板 membership 页为演示态）——
          // 点击只给「即将上线」反馈，不发起购买（docs/08 §16 主 CTA 语义保留）
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('joinPlus')}
            onPress={() => showToast(t('plusComingSoon'), 'info')}
            style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
          >
            <AppIcon name="crown" color={semantic.canvasDeep} size={18} />
            <Text style={styles.ctaText}>{t('joinPlus')}</Text>
          </Pressable>
        ) : (
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
        )}
      </View>

      {/* 购买确认 sheet：商品 / 价格 / 永久属性 + 恢复购买入口（doc-08 §16/§21） */}
      {sheetOpen && product ? (
        <SheetOverlay onClose={() => setSheetOpen(false)}>
          <Text style={styles.sheetTitle}>{t('confirmTitle')}</Text>
          <View style={styles.sheetRows}>
            <InfoRow label="商品" value={product.skinName} />
            <InfoRow label="价格" value={priceLabel ?? ''} />
            <InfoRow label="属性" value={t('confirmPermanent')} />
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semantic.canvas,
  },
  header: {
    height: 56,
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
    color: semantic.textPrimary,
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
    backgroundColor: semantic.surfaceRaised,
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
    color: semantic.textMuted,
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
    borderColor: semantic.borderStandard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateChipActive: {
    borderColor: semantic.actionFocus,
    backgroundColor: 'rgba(79,143,232,0.16)',
  },
  stateChipText: {
    ...type.label,
    color: semantic.textSecondary,
  },
  stateChipTextActive: {
    color: semantic.actionFocus,
  },
  infoCard: {
    marginTop: space.x4,
    marginHorizontal: space.x4,
    borderRadius: radii.card,
    backgroundColor: semantic.surface,
    borderWidth: 1,
    borderColor: semantic.borderSoft,
    padding: space.x4,
    gap: space.x3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  skinName: {
    ...type.title1,
    color: semantic.textPrimary,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x1,
  },
  creatorText: {
    ...type.label,
    color: colors.membershipGold,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.x4,
  },
  infoLabel: {
    ...type.body,
    color: semantic.textMuted,
  },
  infoValue: {
    ...type.body,
    color: semantic.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
  commercialNote: {
    ...type.caption,
    color: semantic.textMuted,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semantic.borderSoft,
    paddingTop: space.x3,
  },
  ctaArea: {
    paddingHorizontal: space.x4,
    paddingBottom: space.x3,
  },
  cta: {
    minHeight: 52,
    borderRadius: radii.control,
    backgroundColor: semantic.actionPrimary,
    paddingHorizontal: space.x5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.x2,
  },
  ctaText: {
    ...type.bodyStrong,
    color: semantic.canvasDeep,
  },
  ctaSkeleton: {
    minHeight: 52,
    borderRadius: radii.control,
    backgroundColor: semantic.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.7,
  },
  ctaSkeletonText: {
    ...type.bodyStrong,
    color: semantic.textMuted,
  },
  sheetTitle: {
    ...type.title3,
    color: semantic.textPrimary,
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
    color: semantic.actionFocus,
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
    color: semantic.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 44,
    paddingHorizontal: space.x5,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: semantic.borderStandard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    ...type.bodyStrong,
    color: semantic.textPrimary,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});
