import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppButton, PageHeader } from '../../../design-system/components';
import { AppIcon, type IconName } from '../../../design-system/AppIcon';
import { currentLanguage } from '../../../i18n/core';
import { telemetry } from '../../../telemetry/Telemetry';
import { radii, space, type ThemeColors, type as typeScale } from '../../../theme/tokens';
import { useThemeStyles } from '../../../theme/useThemeStyles';
import { usePreferences } from '../../../preferences/PreferencesProvider';
import { useApp } from '../../../state/AppStore';
import type { OrderFilter } from '../domain/orderAggregation';
import { groupOrdersByMonth } from '../domain/orderAggregation';
import { displayTitleOf, statusMeta, type OrderItem, type OrderStatusTone } from '../domain/orderModels';
import { useOrderCenter } from '../application/useOrderCenter';

// 订单中心（RevenueCat 风格转译）：会员单+皮肤单双来源合并、按月分组、
// 语义色 StatusPill（图标+颜色双通道）、筛选 chips、下拉刷新、详情展开。
// 样式全走 useThemeStyles（旧 OrdersScreen 的模块级 styles 已废除）。

// 筛选/状态/通道的 i18n key 用字面量联合（t() 键类型来自 resources as const，
// string 会破坏编译期键校验）。
type FilterLabelKey = 'filterAll' | 'filterMembership' | 'filterSkin';
type StatusLabelKey =
  | 'statusSuccess' | 'statusFailed' | 'statusPending' | 'statusProcessing' | 'statusRefunded';
type ProviderLabelKey =
  | 'providerApple' | 'providerGoogle' | 'providerHms' | 'providerStore' | 'providerMock' | 'providerOther';

const FILTERS: readonly { key: OrderFilter; labelKey: FilterLabelKey }[] = [
  { key: 'all', labelKey: 'filterAll' },
  { key: 'membership', labelKey: 'filterMembership' },
  { key: 'skin', labelKey: 'filterSkin' },
];

/** #rrggbb 形态追加 alpha 做软底；非 hex（服务端主题可下发任意色值）回落中性底。 */
function softBg(color: string, fallback: string): string {
  return color.startsWith('#') && (color.length === 7 || color.length === 4)
    ? `${color}29`
    : fallback;
}

function toneForeground(p: ThemeColors, tone: OrderStatusTone): string {
  switch (tone) {
    case 'success': return p.success;
    case 'error': return p.error;
    case 'warning': return p.warning;
    default: return p.textSecondary;
  }
}

function toneSoftBackground(p: ThemeColors, tone: OrderStatusTone): string {
  switch (tone) {
    case 'success': return p.successSoft;
    case 'error': return softBg(p.error, p.surfaceMuted);
    case 'warning': return p.warningSoft;
    default: return p.surfaceMuted;
  }
}

function providerLabelKey(provider: string): ProviderLabelKey {
  switch (provider) {
    case 'apple': return 'providerApple';
    case 'google': return 'providerGoogle';
    case 'hms': return 'providerHms';
    case 'store': return 'providerStore';
    case 'mock': return 'providerMock';
    default: return 'providerOther';
  }
}

function statusLabelKey(status: OrderItem['status']): StatusLabelKey {
  switch (status) {
    case 'success': return 'statusSuccess';
    case 'failed': return 'statusFailed';
    case 'refunded': return 'statusRefunded';
    case 'processing': return 'statusProcessing';
    default: return 'statusPending';
  }
}

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat(currentLanguage(), { style: 'currency', currency })
    .format(amountMinor / 100);
}

function monthLabel(monthKey: string): string {
  if (monthKey === 'unknown') return monthKey;
  const [year, month] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat(currentLanguage(), { year: 'numeric', month: 'long' })
    .format(new Date(year ?? 1970, (month ?? 1) - 1, 1));
}

export function OrderCenterScreen() {
  const { t } = useTranslation('orders');
  const { user, navigate } = useApp();
  const { palette } = usePreferences();
  const styles = useThemeStyles(makeStyles);
  const [filter, setFilter] = useState<OrderFilter>('all');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const { state, refreshing, refresh, reload, visibleItems, failedSources } = useOrderCenter(
    user !== null, filter,
  );

  const sections = useMemo(() => groupOrdersByMonth(visibleItems), [visibleItems]);

  const selectFilter = (next: OrderFilter) => {
    if (next === filter) return;
    setFilter(next);
    telemetry.track('ui_action', { action_id: `orders.filter.${next}` });
  };

  return (
    <View style={styles.screen}>
      <PageHeader title={t('title')} />
      <View style={styles.filterRow} accessibilityRole="tablist">
        {FILTERS.map(({ key, labelKey }) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === key }}
            onPress={() => selectFilter(key)}
            style={({ pressed }) => [
              styles.filterItem,
              filter === key && styles.filterItemActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.filterText, filter === key && styles.filterTextActive]}>
              {t(labelKey)}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={user ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={palette.textSecondary}
          />
        ) : undefined}
      >
        {!user ? (
          <EmptyState
            icon="lock"
            text={t('signInRequired')}
            actionLabel={t('signInCta')}
            onAction={() => navigate('auth.signIn')}
          />
        ) : state.status === 'loading' ? (
          <ListSkeleton />
        ) : state.status === 'error' ? (
          <EmptyState icon="alert" text={state.message} actionLabel={t('retry')} onAction={reload} />
        ) : visibleItems.length === 0 ? (
          <EmptyState
            icon="gift"
            text={t('empty')}
            actionLabel={t('emptyCta')}
            onAction={() => navigate('store.home')}
          />
        ) : (
          <>
            {failedSources.membershipFailed ? <SourceFailedNotice textKey="membershipSourceFailed" /> : null}
            {failedSources.skinsFailed ? <SourceFailedNotice textKey="skinSourceFailed" /> : null}
            {sections.map((section) => (
              <View key={section.monthKey} style={styles.section}>
                <Text style={styles.sectionTitle}>{monthLabel(section.monthKey)}</Text>
                {section.items.map((item) => (
                  <OrderRow
                    key={item.key}
                    item={item}
                    expanded={expandedKey === item.key}
                    onToggle={() => setExpandedKey((current) => (current === item.key ? null : item.key))}
                  />
                ))}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** 状态 pill：图标+颜色双通道编码（不单靠颜色区分状态，无障碍）。 */
function StatusPill({ item }: Readonly<{ item: OrderItem }>) {
  const { t } = useTranslation('orders');
  const { palette } = usePreferences();
  const styles = useThemeStyles(makeStyles);
  const meta = statusMeta(item.status);
  return (
    <View
      style={[styles.pill, { backgroundColor: toneSoftBackground(palette, meta.tone) }]}
      accessibilityLabel={t(statusLabelKey(item.status))}
    >
      <AppIcon name={meta.icon} size={11} color={toneForeground(palette, meta.tone)} />
      <Text style={[styles.pillText, { color: toneForeground(palette, meta.tone) }]}>
        {t(statusLabelKey(item.status))}
      </Text>
    </View>
  );
}

function OrderRow({ item, expanded, onToggle }: Readonly<{
  item: OrderItem;
  expanded: boolean;
  onToggle: () => void;
}>) {
  const { t } = useTranslation('orders');
  const { palette } = usePreferences();
  const { navigate } = useApp();
  const styles = useThemeStyles(makeStyles);
  const meta = statusMeta(item.status);
  const kindLabel = item.kind === 'membership' ? t('kindMembership') : t('kindSkin');
  return (
    <View style={[styles.card, expanded && styles.cardExpanded]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${displayTitleOf(item)}, ${t(statusLabelKey(item.status))}`}
        onPress={onToggle}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <View
          style={[
            styles.statusIcon,
            { backgroundColor: toneSoftBackground(palette, meta.tone) },
          ]}
        >
          <AppIcon name={meta.icon} size={16} color={toneForeground(palette, meta.tone)} />
        </View>
        <View style={styles.rowMain}>
          <Text style={styles.rowTitle} numberOfLines={1}>{displayTitleOf(item)}</Text>
          <Text style={styles.rowCaption}>
            {kindLabel} · {t(providerLabelKey(item.provider))}
          </Text>
        </View>
        <View style={styles.rowSide}>
          <Text style={styles.rowAmount}>{formatMoney(item.amountMinor, item.currency)}</Text>
          <StatusPill item={item} />
        </View>
        <View style={[styles.chevron, expanded && styles.chevronExpanded]}>
          <AppIcon name="chevron-down" size={16} color={palette.textSecondary} />
        </View>
      </Pressable>
      {expanded ? (
        <View style={styles.detail}>
          <DetailRow label={t('detailOrderId')} value={item.id} />
          {item.detail.storeProductId ? (
            <DetailRow label={t('detailStoreProduct')} value={item.detail.storeProductId} />
          ) : null}
          {item.completedAt ? (
            <DetailRow
              label={t('detailCompletedAt')}
              value={new Date(item.completedAt).toLocaleString(currentLanguage())}
            />
          ) : null}
          <DetailRow
            label={t('detailEntitlement')}
            value={item.entitled ? t('detailEntitled') : t('detailNotEntitled')}
          />
          {item.kind === 'skin' && item.slug ? (
            <AppButton
              label={t('viewSkin')}
              icon="palette"
              variant="secondary"
              onPress={() => navigate('store.skinDetail', { skinSlug: item.slug as string })}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function DetailRow({ label, value }: Readonly<{ label: string; value: string }>) {
  const styles = useThemeStyles(makeStyles);
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function SourceFailedNotice({ textKey }: Readonly<{
  textKey: 'membershipSourceFailed' | 'skinSourceFailed';
}>) {
  const { t } = useTranslation('orders');
  const { palette } = usePreferences();
  const styles = useThemeStyles(makeStyles);
  return (
    <View style={styles.notice}>
      <AppIcon name="alert" size={14} color={palette.warning} />
      <Text style={styles.noticeText}>{t(textKey)}</Text>
    </View>
  );
}

function EmptyState({ icon, text, actionLabel, onAction }: Readonly<{
  icon: IconName;
  text: string;
  actionLabel: string;
  onAction: () => void;
}>) {
  const { palette } = usePreferences();
  const styles = useThemeStyles(makeStyles);
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <AppIcon name={icon} size={28} color={palette.textSecondary} />
      </View>
      <Text style={styles.emptyText}>{text}</Text>
      <AppButton label={actionLabel} onPress={onAction} />
    </View>
  );
}

function ListSkeleton() {
  const styles = useThemeStyles(makeStyles);
  return (
    <View>
      {[0, 1, 2].map((section) => (
        <View key={section} style={styles.section}>
          <View style={styles.skeletonTitle} />
          {[0, 1].map((row) => (
            <View key={row} style={[styles.card, styles.skeletonCard]}>
              <View style={styles.skeletonCircle} />
              <View style={styles.skeletonLines}>
                <View style={styles.skeletonLine} />
                <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const makeStyles = (p: ThemeColors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: p.canvas,
  },
  content: {
    paddingHorizontal: space.x4,
    paddingBottom: space.x6,
    gap: space.x4,
  },
  pressed: {
    opacity: 0.7,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: space.x4,
    paddingBottom: space.x2,
    gap: space.x2,
  },
  filterItem: {
    minHeight: 40,
    paddingHorizontal: space.x4,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: p.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterItemActive: {
    backgroundColor: p.brandSoft,
    borderColor: p.brand,
  },
  filterText: {
    ...typeScale.body,
    color: p.textSecondary,
  },
  filterTextActive: {
    color: p.brand,
    fontWeight: '600',
  },
  section: {
    gap: space.x2,
  },
  sectionTitle: {
    ...typeScale.caption,
    color: p.textSecondary,
    marginTop: space.x1,
  },
  card: {
    backgroundColor: p.surfaceRaised,
    borderColor: p.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.card,
    padding: space.x3,
  },
  cardExpanded: {
    borderColor: p.brand,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
  },
  statusIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    ...typeScale.bodyStrong,
    color: p.text,
  },
  rowCaption: {
    ...typeScale.caption,
    color: p.textSecondary,
  },
  rowSide: {
    alignItems: 'flex-end',
    gap: space.x1,
  },
  rowAmount: {
    ...typeScale.bodyStrong,
    color: p.text,
    fontVariant: ['tabular-nums'],
  },
  chevron: {
    marginLeft: -space.x1,
  },
  chevronExpanded: {
    transform: [{ rotate: '180deg' }],
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: radii.round,
    paddingHorizontal: space.x2,
    paddingVertical: 2,
    alignSelf: 'flex-end',
  },
  pillText: {
    ...typeScale.micro,
    fontWeight: '700',
  },
  detail: {
    marginTop: space.x3,
    paddingTop: space.x3,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: p.border,
    gap: space.x2,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
  },
  detailLabel: {
    ...typeScale.caption,
    color: p.textSecondary,
    width: 72,
  },
  detailValue: {
    ...typeScale.caption,
    color: p.text,
    flex: 1,
    textAlign: 'right',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2,
    backgroundColor: p.warningSoft,
    borderRadius: radii.card,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2,
  },
  noticeText: {
    ...typeScale.caption,
    color: p.text,
    flex: 1,
  },
  empty: {
    alignItems: 'center',
    gap: space.x3,
    paddingTop: space.x8,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: radii.round,
    backgroundColor: p.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...typeScale.body,
    color: p.textSecondary,
    textAlign: 'center',
  },
  skeletonTitle: {
    height: 14,
    width: 88,
    borderRadius: radii.control,
    backgroundColor: p.surfaceMuted,
  },
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
  },
  skeletonCircle: {
    width: 36,
    height: 36,
    borderRadius: radii.round,
    backgroundColor: p.surfaceMuted,
  },
  skeletonLines: {
    flex: 1,
    gap: space.x2,
  },
  skeletonLine: {
    height: 12,
    borderRadius: radii.control,
    backgroundColor: p.surfaceMuted,
  },
  skeletonLineShort: {
    width: '45%',
  },
});
