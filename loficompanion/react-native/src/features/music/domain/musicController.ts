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
  /**
   * 画面门控：lofi 只在专注画面与自习室播放（首页/成就/我的恒静默）。
   * 这两个 Screen 聚焦时置 true、失焦/卸载置 false；与会话状态相与生效
   * （会话活跃 ∧ 画面在场 才出声）。锁屏/切后台不改变导航聚焦，后台续播不受影响。
   */
  setScreenActive(active: boolean): void;
  /**
   * 氛围在场（自习室）：房间本身就是「在听 lofi」的场景，无需专注会话。
   * 出声条件放宽为 (会话活跃 ∨ 氛围在场) ∧ 画面在场 ∧ 未静音；
   * 自习室 Screen 聚焦时置 true、失焦/卸载置 false。
   */
  setAmbientActive(active: boolean): void;
  /** 选曲：会话中调用立即切换，空闲时仅记录（下轮生效） */
  selectTrack(track: MusicTrack): void;
  /**
   * 房间 Radio（自习室）：传非空列表即进入随机轮播模式（一曲播完随机换下一
   * 曲，相邻不重曲）；传 null 回归单曲循环（选中曲目）。列表优先于 selectTrack
   * ——Radio 模式下选曲仅记录、不打断轮播。
   */
  setPlaylist(tracks: readonly MusicTrack[] | null): void;
  /** 测试/开发释放底层播放器 */
  dispose(): void;
}
