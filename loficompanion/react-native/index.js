// 标准化入口（SDK 50+ 模板布局）：Metro 的 /index.bundle 从这里开始。
// 行为与旧 node_modules/expo/AppEntry.js 完全一致（registerRootComponent）。
import './src/i18n';
import { registerRootComponent } from 'expo';

import App from './App';
import { telemetry } from './src/telemetry/Telemetry';

// 全局兜底：渲染树之外的逃逸异常（Promise rejection、回调抛错）此前完全
// 不可观测——ErrorBoundary 只覆盖渲染路径，run() 只覆盖动作路径。
const previousHandler = ErrorUtils.getGlobalHandler?.();
ErrorUtils.setGlobalHandler?.((error, isFatal) => {
  try {
    telemetry.report(error instanceof Error ? error : new Error(String(error)), {
      fatal: Boolean(isFatal),
      source: 'global_handler',
    });
  } catch {
    // 上报自身失败不能阻断默认崩溃处理
  }
  previousHandler?.(error, isFatal);
});

registerRootComponent(App);
