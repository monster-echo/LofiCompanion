import type { TFunction } from 'i18next';
import type { BillingPlan, MembershipTier } from './models';

/**
 * 服务端目录（bootstrap config.tiers / config.plans）的 summary/name 是
 * 运营配置文案，当前只下发中文。与 MembershipScreen benefitsOf 的
 * entitlement 键同策略：已登记 id 在渲染期翻译成用户语言（键在 membership
 * 命名空间），未登记 id 回落服务端原文——目录先行扩容时页面不出空文案。
 * 字面量键分发是为通过 i18n 类型守卫（CustomTypeOptions）。
 */
type CatalogT = TFunction<'membership'>;

export function tierDisplaySummary(tier: MembershipTier, t: CatalogT): string {
  if (tier.id === 'free') return t('tierFreeSummary');
  if (tier.id === 'plus') return t('tierPlusSummary');
  return tier.summary;
}

export function planDisplayName(plan: BillingPlan, t: CatalogT): string {
  if (plan.id === 'plus-monthly') return t('planPlusMonthly');
  if (plan.id === 'plus-yearly') return t('planPlusYearly');
  return plan.name;
}
