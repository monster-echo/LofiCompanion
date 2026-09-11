import { SkinPackError } from '../../skins/application/skinPackController';

/**
 * 进房素材闸门（框架无关纯逻辑，node 可测）：注册表已有清单（内置/已下载
 * 资源包）直接进；缺清单先试资源包下载——免费包匿名可拉、已购/试用中的包
 * 门禁放行，下载完成即全媒体进房。未购付费（gated）与网络失败落海报兜底
 * 进房——房间始终可进，解锁引导交给房间页锁提示 pill（「study room 也可以
 * 直接进入」的产品语义）。busy（另一包下载中）不进房，交给列表页 toast。
 */

export type RoomEntryOutcome =
  /** 全媒体进房（已有清单或下载完成） */
  | 'ready'
  /** 海报兜底进房：未购付费（房间页 pill 引导解锁，无需 toast 打扰） */
  | 'gated'
  /** 海报兜底进房：网络/清单异常（列表页补 toast 说明） */
  | 'error'
  /** 不进房：另一资源包下载中（列表页 toast 提示稍候） */
  | 'busy';

export async function enterRoomPack(deps: {
  slug: string;
  /** 注册表（useFocus().skins）里已能解析到该房间皮肤清单 */
  hasManifest: boolean;
  /** 缺省注入 focus.actions.downloadSkinPack（测试注入桩） */
  downloadPack: (slug: string) => Promise<unknown>;
}): Promise<RoomEntryOutcome> {
  if (deps.hasManifest) return 'ready';
  try {
    await deps.downloadPack(deps.slug);
    return 'ready';
  } catch (error) {
    if (error instanceof SkinPackError) {
      if (error.kind === 'busy') return 'busy';
      if (error.kind === 'gated') return 'gated';
    }
    return 'error';
  }
}
