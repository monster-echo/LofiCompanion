import { NextResponse, type NextRequest } from 'next/server';
import { ApiError, handleError } from '@/lib/http';
import { getPublishedSkinStateAsset } from '@/features/skins/data/repository';
import { deriveThumbKey } from '@/features/skins/data/thumbs';
import { objectExists, signReadUrl } from '@/features/skins/data/storage';

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';

// ?state= 白名单（CompanionState 全集）：非法值按缺省处理回落 ready 海报，
// 防任意字符串打穿缓存键与查库放大。
const STATE_PARAMS = new Set(['ready', 'focusing', 'paused', 'drinking', 'resting', 'completed']);

// thumb 在位的进程内正缓存：生成是一次性事件，见过即永久命中（进程重启才
// 重查 Head）。未缓存缺失态每次真实 Head——发布/回填补齐后无需重启即生效。
const thumbSeen = new Set<string>();

// GET /api/v1/skins/{id}/poster —— 公开主题海报（302 → 对象存储）。
// 未登录可用、不走权益门禁：海报 objectKey 本就随公开目录（GET /v1/skins）
// 对所有人下发，属营销资产。房间卡/商店卡在皮肤 manifest 未就位（未购付费
// 皮肤/未拉取）时以此兜底渲染，保证每个主题都有可见封面。对象桶保持私有，
// 这里只签短时效 presigned GET；配置 S3_PUBLIC_BASE 时直接 302 到公网 URL。
//
// v=thumb（卡片场景用）：签 .thumb.jpg 派生对象（960 宽 JPEG，发布/回填管线
// 生成）；thumb 尚未生成时回落原图——旧皮肤在回填前不 broken。缺省 v=original
// 全尺寸原图（详情页大图、活动屏兜底等大画幅场景）。
// state=（详情页四态预览兜底用）：请求指定状态的海报；该态缺失自动回落
// ready 海报（付费皮肤未购时四态预览全兜底，不用占位图）。
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const stateParam = request.nextUrl.searchParams.get('state');
    const state = stateParam !== null && STATE_PARAMS.has(stateParam) ? stateParam : null;
    const posterKey = await getPublishedSkinStateAsset(id, state, 'posterUrl');
    if (posterKey === null) {
      throw new ApiError(404, 'SKIN_NOT_FOUND', '皮肤不存在、未发布或无海报');
    }
    let objectKey = posterKey;
    if (request.nextUrl.searchParams.get('v') === 'thumb') {
      const thumbKey = deriveThumbKey(posterKey);
      if (thumbKey !== null) {
        if (thumbSeen.has(thumbKey) || (await objectExists(thumbKey))) {
          thumbSeen.add(thumbKey);
          objectKey = thumbKey;
        }
      }
    }
    const url = await signReadUrl(objectKey, 3600);
    return new NextResponse(null, {
      status: 302,
      headers: {
        location: url,
        // 重定向本身短缓存：换签 URL 随请求变化，客户端按原始 URL 缓存图片
        'cache-control': 'public, max-age=300',
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
