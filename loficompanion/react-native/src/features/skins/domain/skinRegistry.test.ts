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
  const keyPrefix = 'loficompanion/production/skins/pilot-skin';
  const raw = {
    id: 'pilot-skin-v2',
    slug: 'pilot-skin',
    name: '试发布皮肤',
    nameEn: 'Pilot Skin',
    accessType: 'paid',
    manifestVersion: 2,
    defaultState: 'ready',
    themeTokens: { accent: '#ABCDEF', surface: '#123456' },
    animation: { crossfadeMs: 420, focalZoom: 1.2 },
    wellness: { autoDrink: { enabled: true, minIntervalMinutes: 15, maxIntervalMinutes: 25 } },
    states: [
      {
        state: 'ready',
        posterUrl: `${keyPrefix}/ready.png`,
        videoUrl: `${keyPrefix}/videos/ready.mp4`,
        videoLoop: true,
        focalPointX: 0.4,
        focalPointY: 0.5,
        durationMs: 3500,
      },
      { state: 'focusing', posterUrl: `${keyPrefix}/focusing.png`, focalPointX: 0.5, focalPointY: 0.38, durationMs: 4000 },
    ],
    eventMappings: [
      { eventType: 'focus.started', priority: 80, interruptible: false, cooldownSeconds: 0, returnState: 'focusing' },
      { eventType: 'wellness.drink', priority: 70, interruptible: false, cooldownSeconds: 60, returnState: 'focusing' },
      // 未知事件/缺字段条目直接丢弃
      { eventType: 'legacy.event', priority: 1, interruptible: true, returnState: 'ready' },
    ],
  };
  const toUri = (_slug: string, version: number, state: string) => `file:///docs/skins/pilot-skin/v${version}/${state}.png`;
  const toVideoUri = (_slug: string, version: number, state: string) => `file:///docs/skins/pilot-skin/v${version}/${state}.mp4`;

  it('物化为本地 uri 形态并保留 posterKeys', () => {
    const result = materializeManifest(raw, toUri, toVideoUri);
    expect(result).not.toBeNull();
    const { manifest, posterKeys } = result!;
    expect(manifest.manifestVersion).toBe(2);
    expect(manifest.accessType).toBe('paid');
    expect(manifest.states[0]?.poster).toEqual({
      uri: 'file:///docs/skins/pilot-skin/v2/ready.png',
    });
    expect(posterKeys['ready']).toBe(`${keyPrefix}/ready.png`);
    // 渲染纪律：{uri} 引用稳定（重复物化的同状态 uri 相等）
    const again = materializeManifest(raw, toUri, toVideoUri)!;
    expect(again.manifest.states[0]?.poster).toEqual(manifest.states[0]?.poster);
  });

  it('云端化完整语义：视频/事件表/动画/健康排程/英文名', () => {
    const { manifest, videoKeys } = materializeManifest(raw, toUri, toVideoUri)!;
    // ready 声明视频 → loopVideo 缓存 uri + 背景循环；focusing 未声明 → 纯海报
    expect(manifest.states[0]?.loopVideo).toEqual({ uri: 'file:///docs/skins/pilot-skin/v2/ready.mp4' });
    expect(manifest.states[0]?.videoLoop).toBe(true);
    expect(manifest.states[1]?.loopVideo).toBeUndefined();
    expect(videoKeys['ready']).toBe(`${keyPrefix}/videos/ready.mp4`);
    expect(videoKeys['focusing']).toBeUndefined();
    // 事件表：合法条目透传（cooldown 缺省 0），未知事件丢弃
    expect(manifest.eventMappings).toHaveLength(2);
    expect(manifest.eventMappings[0]).toMatchObject({
      eventType: 'focus.started',
      priority: 80,
      interruptible: false,
      cooldownSeconds: 0,
      returnState: 'focusing',
    });
    expect(manifest.eventMappings[1]?.cooldownSeconds).toBe(60);
    expect(manifest.animation).toEqual({ crossfadeMs: 420, focalZoom: 1.2 });
    expect(manifest.wellness?.autoDrink).toEqual({
      enabled: true,
      minIntervalMinutes: 15,
      maxIntervalMinutes: 25,
    });
    expect(manifest.nameEn).toBe('Pilot Skin');
  });

  it('缺省段回退：无事件/动画/健康段时用安全默认值', () => {
    const minimal = {
      slug: 'pilot-skin',
      manifestVersion: 1,
      states: [{ state: 'ready', posterUrl: `${keyPrefix}/ready.png` }],
    };
    const { manifest } = materializeManifest(minimal, toUri, toVideoUri)!;
    expect(manifest.eventMappings).toEqual([]);
    expect(manifest.animation).toBeUndefined();
    expect(manifest.wellness).toBeUndefined();
    expect(manifest.nameEn).toBeUndefined();
    expect(manifest.accessType).toBe('free');
  });

  it('http(s) 逃逸（poster/video）与缺字段拒绝', () => {
    expect(
      materializeManifest(
        { ...raw, states: [{ state: 'ready', posterUrl: 'https://evil.example/a.png' }] },
        toUri,
        toVideoUri,
      ),
    ).toBeNull();
    expect(
      materializeManifest(
        { ...raw, states: [{ state: 'ready', posterUrl: `${keyPrefix}/ready.png`, videoUrl: 's3://bucket/a.mp4' }] },
        toUri,
        toVideoUri,
      ),
    ).toBeNull();
    expect(materializeManifest({ slug: 'x' }, toUri, toVideoUri)).toBeNull();
  });
});
