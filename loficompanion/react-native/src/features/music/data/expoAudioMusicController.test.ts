import { describe, expect, it, vi, beforeEach } from 'vitest';

// expo-audio 是原生模块，node 测试桩掉：播放器只记录调用序列，
// 断言「pause 必须先于/不被 play 盖过」这类时序契约。
const playerCalls: string[] = [];
/** 捕获 playbackStatusUpdate 监听（didJustFinish 换曲路径的驱动入口） */
let statusListener: ((status: { didJustFinish: boolean }) => void) | null = null;

const fakePlayer = {
  loop: true,
  volume: 1,
  play: vi.fn(() => playerCalls.push('play')),
  pause: vi.fn(() => playerCalls.push('pause')),
  replace: vi.fn(() => playerCalls.push('replace')),
  remove: vi.fn(),
  addListener: vi.fn((_: string, fn: (status: { didJustFinish: boolean }) => void) => {
    statusListener = fn;
    return { remove: vi.fn() };
  }),
};

vi.mock('expo-audio', () => ({
  createAudioPlayer: vi.fn(() => fakePlayer),
  setAudioModeAsync: vi.fn(async () => undefined),
}));

// 真机 require 资源号为非 0；node 环境兜底 0 会走「无内置曲」分支，
// 与设备行为不符——这里按设备等价给真值。
vi.mock('./bundledTracks', () => ({
  BUNDLED_TRACKS: [
    { id: 'rainy-night', title: 'rainy', source: 'bundled', bundledModule: 111 },
    { id: 'study-session', title: 'study', source: 'bundled', bundledModule: 222 },
  ],
}));

const resolvedKeys: string[] = [];
vi.mock('../../../data/apiClient', () => ({
  resolveAssetUrl: vi.fn(async (objectKey: string) => {
    resolvedKeys.push(objectKey);
    return `https://cdn/${objectKey}`;
  }),
  invalidateAssetUrl: vi.fn(),
}));

import { createExpoAudioMusicController } from './expoAudioMusicController';
import type { MusicTrack } from '../domain/musicTypes';

const remoteTrack = (id: string): MusicTrack => ({
  id,
  title: id,
  source: 'remote',
  objectKey: `music/${id}.mp3`,
});

/** 微任务+宏任务各一拍：让 apply 的 await 链全部落地 */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** 自习室进/退房的门控序列（对齐 StudyRoomActiveScreen 的效果与清理序） */
function enterRoom(
  c: ReturnType<typeof createExpoAudioMusicController>,
  playlist: readonly MusicTrack[],
): void {
  c.setScreenActive(true);
  c.setAmbientActive(true);
  c.setPlaylist(playlist);
}
function exitRoom(
  c: ReturnType<typeof createExpoAudioMusicController>,
): void {
  c.setAmbientActive(false);
  c.setScreenActive(false);
  c.setPlaylist(null);
}

/**
 * 音乐控制器时序契约（自习室 Radio 上下文）：
 * 停止（pause）不依赖曲源解析——退房/静音/会话暂停必须即时到达，
 * 否则退出房间后音乐会继续播到换签请求返回为止。
 */
describe('expoAudioMusicController 停止即时性', () => {
  beforeEach(() => {
    playerCalls.length = 0;
    resolvedKeys.length = 0;
    statusListener = null;
    vi.clearAllMocks();
    fakePlayer.addListener.mockImplementation(
      (_: string, fn: (status: { didJustFinish: boolean }) => void) => {
        statusListener = fn;
        return { remove: vi.fn() };
      },
    );
  });

  it('退房收尾：最后一拍是 pause（Radio 回归单曲态后静默）', async () => {
    const c = createExpoAudioMusicController();
    enterRoom(c, [remoteTrack('a'), remoteTrack('b'), remoteTrack('c')]);
    await flush();
    expect(playerCalls).toContain('play');

    playerCalls.length = 0;
    exitRoom(c);
    await flush();
    expect(playerCalls[playerCalls.length - 1]).toBe('pause');
  });

  it('个人选曲=远端曲且换签悬挂：退房 pause 仍即时到达（不等解析）', async () => {
    const c = createExpoAudioMusicController({
      // 仅个人选曲的 key 换签悬挂（模拟无超时的慢网络），Radio 曲正常
      resolveUrl: (objectKey) =>
        objectKey === 'music/my-fav.mp3'
          ? new Promise(() => undefined)
          : Promise.resolve(`https://cdn/${objectKey}`),
    });
    c.selectTrack(remoteTrack('my-fav'));
    enterRoom(c, [remoteTrack('a'), remoteTrack('b'), remoteTrack('c')]);
    await flush();
    expect(playerCalls).toContain('play');

    playerCalls.length = 0;
    exitRoom(c);
    await flush();
    expect(playerCalls).toContain('pause');
    expect(playerCalls).not.toContain('play');
  });

  it('进房加载在途即退房：迟到的加载不得触发 play', async () => {
    // executor 同步执行，release 在下一行前已就位
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const c = createExpoAudioMusicController({
      resolveUrl: () => gate.then(() => 'https://cdn/slow'),
    });
    enterRoom(c, [remoteTrack('slow-a'), remoteTrack('slow-b')]);
    exitRoom(c);
    release();
    await flush();
    expect(playerCalls).not.toContain('play');
  });

  it('退房后 Radio 曲播完（didJustFinish）：不得重新起播', async () => {
    const c = createExpoAudioMusicController();
    enterRoom(c, [remoteTrack('a'), remoteTrack('b'), remoteTrack('c')]);
    await flush();
    expect(playerCalls).toContain('play');

    exitRoom(c);
    await flush();
    playerCalls.length = 0;
    statusListener?.({ didJustFinish: true });
    await flush();
    expect(playerCalls).not.toContain('play');
  });
});
