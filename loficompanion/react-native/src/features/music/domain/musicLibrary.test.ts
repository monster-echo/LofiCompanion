import { describe, expect, it } from 'vitest';
import {
  availableTracks,
  parseMusicManifest,
  resolveSelectedTrack,
} from './musicLibrary';
import type { MusicTrack } from './musicTypes';

/** 曲库纯逻辑测试：清单容错解析、租户前缀纪律、访客合并、选曲回落。 */

const BUNDLED: readonly MusicTrack[] = [
  { id: 'rainy-night', title: 'Rainy', source: 'bundled', bundledModule: 1 },
  { id: 'study-session', title: 'Study', source: 'bundled', bundledModule: 2 },
];

describe('parseMusicManifest', () => {
  it('解析 {tracks:[...]} 与裸数组两种形态', () => {
    const entry = { id: 'midnight', title: 'Midnight', objectKey: 'loficompanion/production/music/v1/midnight.mp3' };
    expect(parseMusicManifest({ version: 1, tracks: [entry] })).toHaveLength(1);
    expect(parseMusicManifest([entry])).toHaveLength(1);
  });

  it('丢弃缺失/非法 id、缺 objectKey 与 http(s)/s3:// 形态（租户前缀纪律）', () => {
    const tracks = parseMusicManifest({
      tracks: [
        { id: 'ok', title: 'OK', objectKey: 'loficompanion/production/music/v1/ok.mp3' },
        { id: 'BAD ID', title: 'x', objectKey: 'loficompanion/production/x.mp3' },
        { id: 'nokey', title: 'x' },
        { id: 'http', title: 'x', objectKey: 'https://evil.example/a.mp3' },
        { id: 's3', title: 'x', objectKey: 's3://bucket/key.mp3' },
        'garbage',
        null,
      ],
    });
    expect(tracks.map((track) => track.id)).toEqual(['ok']);
  });

  it('title 缺失回落为 id', () => {
    const [track] = parseMusicManifest({ tracks: [{ id: 't1', objectKey: 'k/1.mp3' }] });
    expect(track?.title).toBe('t1');
  });
});

describe('availableTracks', () => {
  const remote: readonly MusicTrack[] = [
    { id: 'rainy-night', title: 'Rainy 256k', source: 'remote', objectKey: 'k/rainy.mp3' },
    { id: 'midnight', title: 'Midnight', source: 'remote', objectKey: 'k/midnight.mp3' },
  ];

  it('访客只有内置两首', () => {
    expect(availableTracks(BUNDLED, remote, false).map((t) => t.id)).toEqual([
      'rainy-night',
      'study-session',
    ]);
  });

  it('登录态合并；同 id 内置优先（离线可用）', () => {
    const merged = availableTracks(BUNDLED, remote, true);
    expect(merged.map((t) => t.id)).toEqual([
      'rainy-night',
      'study-session',
      'midnight',
    ]);
    expect(merged[0].source).toBe('bundled');
  });
});

describe('resolveSelectedTrack', () => {
  it('命中已选 id；未知/未选回落首个内置；空曲库为 null', () => {
    const tracks = availableTracks(BUNDLED, [], true);
    expect(resolveSelectedTrack('study-session', tracks)?.id).toBe('study-session');
    expect(resolveSelectedTrack('gone', tracks)?.id).toBe('rainy-night');
    expect(resolveSelectedTrack(null, tracks)?.id).toBe('rainy-night');
    expect(resolveSelectedTrack(null, [])).toBeNull();
  });
});
