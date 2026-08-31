/**
 * 音乐曲目的唯一领域形态：内置（Metro 资源号）与远端（OSS objectKey）二选一。
 */

export interface MusicTrack {
  readonly id: string;
  readonly title: string;
  readonly artist?: string;
  readonly source: 'bundled' | 'remote';
  /** remote 必填：`loficompanion/<env>/` 前缀 objectKey（/storage/urls 只认本 app 前缀） */
  readonly objectKey?: string;
  /** bundled 必填：Metro 静态资源号（require('<literal>')；node/vitest 环境为 0） */
  readonly bundledModule?: number;
}
