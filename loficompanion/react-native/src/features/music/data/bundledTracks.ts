import type { MusicTrack } from '../domain/musicTypes';

/**
 * 内置曲目（AAC 128k，首装离线可听）。许可见 docs/licenses/LOFI-MUSIC-LICENSES.md。
 * Metro 静态收集 require('<literal>')——路径必须是字面量（对齐
 * rainyStudyRoom.generated.ts 的 try/catch-0 模式，node/vitest 环境为 0）。
 */

declare const require: (id: string) => number;

const MODULES: Readonly<Record<'rainy-night' | 'study-session', number>> = (() => {
  try {
    return {
      'rainy-night': require('../../../../assets/music/rainy-night.m4a'),
      'study-session': require('../../../../assets/music/study-session.m4a'),
    };
  } catch {
    return { 'rainy-night': 0, 'study-session': 0 };
  }
})();

export const BUNDLED_TRACKS: readonly MusicTrack[] = [
  {
    id: 'rainy-night',
    title: 'Lofi Study Rainy Night',
    artist: 'alex-morgan',
    source: 'bundled',
    bundledModule: MODULES['rainy-night'],
  },
  {
    id: 'study-session',
    title: 'Lofi Study Session',
    artist: 'alex-morgan',
    source: 'bundled',
    bundledModule: MODULES['study-session'],
  },
];
