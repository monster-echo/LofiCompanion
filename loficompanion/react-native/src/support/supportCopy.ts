import type { TFunction } from 'i18next';

/**
 * 服务端下发文案的渲染期翻译（与 domain/membershipCopy 同策略）：工单分类
 * 的 label 当前只下发中文（embeddedConfig 与服务端配置同源）。已登记 id 在
 * 渲染期翻译成用户语言（键在 support 命名空间），未登记 id 回落服务端原文
 * ——服务端先行扩容分类时下拉不出原始 id。
 * 字面量键分发是为通过 i18n 类型守卫（CustomTypeOptions）。
 */
type SupportT = TFunction<'support'>;

const CATEGORY_LABEL_KEYS = {
  account: 'categoryAccount',
  billing: 'categoryBilling',
  technical: 'categoryTechnical',
  privacy: 'categoryPrivacy',
  suggestion: 'categorySuggestion',
} as const satisfies Record<string, Parameters<SupportT>[0]>;

export function supportCategoryLabel(
  id: string,
  serverLabel: string,
  t: SupportT,
): string {
  const key = CATEGORY_LABEL_KEYS[id as keyof typeof CATEGORY_LABEL_KEYS];
  return key ? t(key) : serverLabel;
}
