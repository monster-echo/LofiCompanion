import { achievements as enAchievements } from './locales/en-US/achievements';
import { leaderboards as enLeaderboards } from './locales/en-US/leaderboards';
import { auth as enAuth } from './locales/en-US/auth';
import { membership as enMembership } from './locales/en-US/membership';
import { errors as enErrors } from './locales/en-US/errors';
import { profile as enProfile } from './locales/en-US/profile';
import { support as enSupport } from './locales/en-US/support';
import { common as enCommon } from './locales/en-US/common';
import { launch as enLaunch } from './locales/en-US/launch';
import { focus as enFocus } from './locales/en-US/focus';
import { settings as enSettings } from './locales/en-US/settings';
import { skins as enSkins } from './locales/en-US/skins';
import { store as enStore } from './locales/en-US/store';
import { studyroom as enStudyroom } from './locales/en-US/studyroom';
import { achievements as zhAchievements } from './locales/zh-CN/achievements';
import { leaderboards as zhLeaderboards } from './locales/zh-CN/leaderboards';
import { auth as zhAuth } from './locales/zh-CN/auth';
import { membership as zhMembership } from './locales/zh-CN/membership';
import { errors as zhErrors } from './locales/zh-CN/errors';
import { profile as zhProfile } from './locales/zh-CN/profile';
import { support as zhSupport } from './locales/zh-CN/support';
import { common as zhCommon } from './locales/zh-CN/common';
import { launch as zhLaunch } from './locales/zh-CN/launch';
import { focus as zhFocus } from './locales/zh-CN/focus';
import { settings as zhSettings } from './locales/zh-CN/settings';
import { skins as zhSkins } from './locales/zh-CN/skins';
import { store as zhStore } from './locales/zh-CN/store';
import { studyroom as zhStudyroom } from './locales/zh-CN/studyroom';

// 命名空间集中注册（i18next 资源要求单一类型根）：命名空间粒度沿用
// per-feature 习惯。zh-CN 为权威形状（t() 键类型由此导出，en-US 键集
// deep-equal 由 parity.test.ts 锁定）。as const 保留字面量键，不写宽注解。
// 注意取模块的具名导出——namespace import 会多包一层导致 t() 落空。
export const resources = {
  'zh-CN': {
    auth: zhAuth,
    errors: zhErrors,
    membership: zhMembership,
    profile: zhProfile,
    support: zhSupport,
    common: zhCommon,
    launch: zhLaunch,
    settings: zhSettings,
    studyroom: zhStudyroom,
    skins: zhSkins,
    store: zhStore,
    focus: zhFocus,
    achievements: zhAchievements,
    leaderboards: zhLeaderboards,
  },
  'en-US': {
    auth: enAuth,
    errors: enErrors,
    membership: enMembership,
    profile: enProfile,
    support: enSupport,
    common: enCommon,
    launch: enLaunch,
    settings: enSettings,
    studyroom: enStudyroom,
    skins: enSkins,
    store: enStore,
    focus: enFocus,
    achievements: enAchievements,
    leaderboards: enLeaderboards,
  },
} as const;
