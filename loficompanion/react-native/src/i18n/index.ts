import { initReactI18next } from 'react-i18next';

import { i18n, initOptions } from './core';
import { deviceLocale } from './deviceLocale';
import { resources } from './resources';

// 应用入口的 i18n 装配（index.js 先于 App 导入本模块）：模块加载即同步
// 初始化——任何导入方（React 挂载前的 ConnectionGate、非 hook 模块的
// i18n.t()）的 t() 立即可用，语言解析不依赖登录态。
i18n.use(initReactI18next).init(initOptions(deviceLocale(), resources));
