import 'i18next';

import type { resources } from './resources';

// t() 键全量编译期检查：zh-CN 资源为形状权威（en-US 由 parity.test.ts 锁键集）。
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: (typeof resources)['zh-CN'];
  }
}
