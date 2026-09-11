import { describe, expect, it, vi } from 'vitest';
import { SkinPackError } from '../../skins/application/skinPackController';
import { enterRoomPack } from './roomPackGate';

/**
 * 进房素材闸门测试（纯 node）：有清单直接进（不触发下载）、下载完成进、
 * gated/网络失败海报兜底进、busy 拒进。回归背景：未拉取包的房间此前直接
 * 进海报兜底态（且海报层因 Fabric Image 尺寸缺陷不可见 → 黑屏观感）。
 */

// SkinPackError 链路带着 telemetry → react-native，node 测试统一打桩（同 skinPackController.test.ts）
vi.mock('../../../telemetry/Telemetry', () => ({ telemetry: { track: vi.fn() } }));

describe('enterRoomPack', () => {
  it('注册表已有清单直接 ready，不触发下载', async () => {
    const downloadPack = vi.fn();
    const outcome = await enterRoomPack({
      slug: 'rainy-study-room',
      hasManifest: true,
      downloadPack,
    });
    expect(outcome).toBe('ready');
    expect(downloadPack).not.toHaveBeenCalled();
  });

  it('缺清单时下载成功 → ready（全媒体进房）', async () => {
    const downloadPack = vi.fn().mockResolvedValue(undefined);
    const outcome = await enterRoomPack({
      slug: 'sunny-classroom',
      hasManifest: false,
      downloadPack,
    });
    expect(outcome).toBe('ready');
    expect(downloadPack).toHaveBeenCalledWith('sunny-classroom');
  });

  it('gated（未购付费）→ gated：海报兜底进房', async () => {
    const downloadPack = vi.fn().mockRejectedValue(new SkinPackError('gated', '401'));
    const outcome = await enterRoomPack({
      slug: 'midnight-workstation',
      hasManifest: false,
      downloadPack,
    });
    expect(outcome).toBe('gated');
  });

  it('busy（另一包下载中）→ busy：不进房，列表页提示稍候', async () => {
    const downloadPack = vi.fn().mockRejectedValue(new SkinPackError('busy', '另一资源包下载中'));
    const outcome = await enterRoomPack({
      slug: 'midnight-workstation',
      hasManifest: false,
      downloadPack,
    });
    expect(outcome).toBe('busy');
  });

  it('network/manifest 失败 → error：海报兜底进房 + 列表页 toast', async () => {
    const downloadPack = vi.fn().mockRejectedValue(new SkinPackError('network', '网络'));
    await expect(
      enterRoomPack({ slug: 'sunny-classroom', hasManifest: false, downloadPack }),
    ).resolves.toBe('error');

    const generic = vi.fn().mockRejectedValue(new Error('清单物化失败'));
    await expect(
      enterRoomPack({ slug: 'sunny-classroom', hasManifest: false, downloadPack: generic }),
    ).resolves.toBe('error');
  });
});
