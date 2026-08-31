import { describe, expect, it } from 'vitest';
import { createSkinRegistry, mergeSkinLists } from './skinRegistry';
import { materializeManifest } from './remoteSkinMaterialize';
import { rainyStudyRoomManifest } from './rainyStudyRoom.generated';
import type { SkinManifest } from './types';

/** 皮肤注册表合并 + 远端 manifest 物化的纯逻辑测试（node 环境，无文件系统）。 */

const remoteSkin = (overrides: Partial<SkinManifest> = {}): SkinManifest => ({
  ...rainyStudyRoomManifest,
  id: 'pilot-skin-v1',
  slug: 'pilot-skin',
  name: '试发布皮肤',
  ...overrides,
});

describe('mergeSkinLists', () => {
  it('内置在前；slug 冲突时远端让位', () => {
    const remote = [
      remoteSkin(),
      remoteSkin({ id: 'another-v1', slug: 'another', name: '另一套' }),
    ];
    const merged = mergeSkinLists([rainyStudyRoomManifest], remote);
    expect(merged.map((skin) => skin.slug)).toEqual([
      'rainy-study-room',
      'pilot-skin',
      'another',
    ]);
  });

  it('远端为空时等价于内置', () => {
    expect(mergeSkinLists([rainyStudyRoomManifest], [])).toEqual([rainyStudyRoomManifest]);
  });
});

describe('createSkinRegistry', () => {
  it('setRemote 通知订阅者；getAll 返回合并视图', () => {
    const registry = createSkinRegistry([rainyStudyRoomManifest]);
    let notified = 0;
    registry.subscribe(() => {
      notified += 1;
    });
    expect(registry.getAll().length).toBe(1);
    registry.setRemote([remoteSkin()]);
    expect(notified).toBe(1);
    expect(registry.getAll().map((skin) => skin.slug)).toEqual([
      'rainy-study-room',
      'pilot-skin',
    ]);
    // 同引用重复 set 不重复通知
    registry.setRemote([remoteSkin()]);
    expect(notified).toBe(2);
  });
});

describe('materializeManifest', () => {
  const raw = {
    id: 'pilot-skin-v2',
    slug: 'pilot-skin',
    name: '试发布皮肤',
    accessType: 'paid',
    manifestVersion: 2,
    defaultState: 'ready',
    themeTokens: { accent: '#ABCDEF', surface: '#123456' },
    states: [
      { state: 'ready', posterUrl: 'loficompanion/production/skins/pilot-skin/ready.png', focalPointX: 0.4, focalPointY: 0.5, durationMs: 3500 },
      { state: 'focusing', posterUrl: 'loficompanion/production/skins/pilot-skin/focusing.png', focalPointX: 0.5, focalPointY: 0.38, durationMs: 4000 },
    ],
  };
  const toUri = (_slug: string, version: number, state: string) => `file:///docs/skins/pilot-skin/v${version}/${state}.png`;

  it('物化为本地 uri 形态并保留 posterKeys', () => {
    const result = materializeManifest(raw, toUri);
    expect(result).not.toBeNull();
    const { manifest, posterKeys } = result!;
    expect(manifest.manifestVersion).toBe(2);
    expect(manifest.accessType).toBe('paid');
    expect(manifest.states[0]?.poster).toEqual({
      uri: 'file:///docs/skins/pilot-skin/v2/ready.png',
    });
    expect(posterKeys['ready']).toBe('loficompanion/production/skins/pilot-skin/ready.png');
    // 渲染纪律：{uri} 引用稳定（重复物化的同状态 uri 相等）
    const again = materializeManifest(raw, toUri)!;
    expect(again.manifest.states[0]?.poster).toEqual(manifest.states[0]?.poster);
  });

  it('http(s) posterUrl 逃逸与缺字段拒绝', () => {
    expect(
      materializeManifest(
        { ...raw, states: [{ state: 'ready', posterUrl: 'https://evil.example/a.png' }] },
        toUri,
      ),
    ).toBeNull();
    expect(materializeManifest({ slug: 'x' }, toUri)).toBeNull();
  });
});
