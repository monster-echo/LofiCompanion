// 标准化入口（SDK 50+ 模板布局）：Metro 的 /index.bundle 从这里开始。
// 行为与旧 node_modules/expo/AppEntry.js 完全一致（registerRootComponent）。
import './src/i18n';
import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
