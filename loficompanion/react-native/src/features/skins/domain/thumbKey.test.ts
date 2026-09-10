import { describe, expect, it } from 'vitest';
import { deriveThumbKey } from './thumbKey';

/** 与 biz-server tests/skin-thumbs.test.ts 同一约定集（双端同约，改动须同步） */
describe('deriveThumbKey', () => {
  it('按约定派生 .thumb.jpg key', () => {
    expect(deriveThumbKey('loficompanion/prod/skins/pilot-skin/ready.png')).toBe(
      'loficompanion/prod/skins/pilot-skin/ready.thumb.jpg',
    );
    expect(deriveThumbKey('loficompanion/prod/skins/pilot-skin/videos/ready.mp4')).toBe(
      'loficompanion/prod/skins/pilot-skin/videos/ready.thumb.jpg',
    );
    expect(deriveThumbKey('loficompanion/prod/skins/x/ready')).toBe(
      'loficompanion/prod/skins/x/ready.thumb.jpg',
    );
    expect(deriveThumbKey('ready.png')).toBe('ready.thumb.jpg');
    expect(deriveThumbKey('a/b/ready.v2.png')).toBe('a/b/ready.v2.thumb.jpg');
  });

  it('无文件名段/隐藏文件返回 null', () => {
    expect(deriveThumbKey('')).toBeNull();
    expect(deriveThumbKey('dir/')).toBeNull();
    expect(deriveThumbKey('.hidden')).toBeNull();
  });
});
