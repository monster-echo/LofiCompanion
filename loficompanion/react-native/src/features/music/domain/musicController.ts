import type { MusicTrack } from './musicTypes';

/**
 * 专注生命周期驱动的音乐效果接口（orchestrate.ts 经 deps.music 消费）。
 * 与 skins 的 CompanionEvent 同思路：域层只声明「何时发生什么」，平台实现
 * （expo-audio）在数据层注入。本文件绝不 import react-native。
 */

export interface FocusMusicEffects {
  /** startSession 真实转换后（幂等调用无副作用由实现保证） */
  sessionStarted(): void;
  /** pause 实际发生转换后（已暂停时的幂等 pause 不会走到这里） */
  paused(): void;
  /** resume 实际发生转换后 */
  resumed(): void;
  /** complete / abandon / 强杀恢复推导出 completed —— 三条终态路径都要调 */
  sessionEnded(): void;
}

export interface MusicController extends FocusMusicEffects {
  /** 专注页静音开关（focusQuickPrefs.muted）：静音=暂停但记住意图，取消静音即恢复 */
  setMuted(muted: boolean): void;
  /** 选曲：会话中调用立即切换，空闲时仅记录（下轮生效） */
  selectTrack(track: MusicTrack): void;
  /** 测试/开发释放底层播放器 */
  dispose(): void;
}
