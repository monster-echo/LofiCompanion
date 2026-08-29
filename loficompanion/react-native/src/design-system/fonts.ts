import { Platform } from 'react-native';

// DEVIATION: Source Serif 4 deferred, timer uses system serif fallback.
// 依据任务规则：expo-font 未在 package.json 声明为直接依赖，按「不新增依赖、
// 不阻塞」处理，跳过字体打包；doc-07 §6.1 的衬线数字改用平台衬线回退。
// 后续引入 expo-font 后在此注册 SourceSerif4-Semibold 并补 useLofiFonts()。
export const fonts = {
  /** 计时器与大指标衬线族：iOS Georgia / Android 系统衬线 */
  serif: Platform.OS === 'ios' ? 'Georgia' : 'serif',
} as const;
