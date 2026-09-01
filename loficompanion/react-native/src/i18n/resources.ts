import { common as enCommon } from './locales/en-US/common';
import { settings as enSettings } from './locales/en-US/settings';
import { common as zhCommon } from './locales/zh-CN/common';
import { settings as zhSettings } from './locales/zh-CN/settings';

// 命名空间集中注册（i18next 资源要求单一类型根）：命名空间粒度沿用
// per-feature 习惯。zh-CN 为权威形状（t() 键类型由此导出，en-US 键集
// deep-equal 由 parity.test.ts 锁定）。as const 保留字面量键，不写宽注解。
// 注意取模块的具名导出——namespace import 会多包一层导致 t() 落空。
export const resources = {
  'zh-CN': {
    common: zhCommon,
    settings: zhSettings,
  },
  'en-US': {
    common: enCommon,
    settings: enSettings,
  },
} as const;
