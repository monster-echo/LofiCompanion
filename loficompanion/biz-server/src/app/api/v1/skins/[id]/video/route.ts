import { NextResponse, type NextRequest } from 'next/server';
import { ApiError, handleError } from '@/lib/http';
import { getPublishedSkinStateAsset } from '@/features/skins/data/repository';
import { signReadUrl } from '@/features/skins/data/storage';

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';

// 与 poster 路由相同的 state 白名单：非法值按缺省处理（走 ready 语义）。
const STATE_PARAMS = new Set(['ready', 'focusing', 'paused', 'drinking', 'resting', 'completed']);

// GET /api/v1/skins/{id}/video —— 公开主题预览视频（302 → 对象存储）。
// 未登录可用、不走权益门禁：loop 视频 objectKey 本就随付费 manifest 下发
// （已购/试用用户可换签下载），此处只服务「未物化皮肤的详情页氛围预览」
// ——视频是营销资产（poster 的动图形态），不泄漏任何权益语义。对象桶保持
// 私有，这里只签短时效 presigned GET。
// 与海报不同：请求态无视频时不回落（视频较重），直接 404——客户端退回
// 海报静图（DetailPreviewVideo 挂载失败即静止海报，无破图路径）。
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const stateParam = request.nextUrl.searchParams.get('state');
    const state = stateParam !== null && STATE_PARAMS.has(stateParam) ? stateParam : null;
    const videoKey = await getPublishedSkinStateAsset(id, state, 'videoUrl');
    if (videoKey === null) {
      throw new ApiError(404, 'SKIN_NOT_FOUND', '皮肤不存在、未发布或该状态无预览视频');
    }
    const url = await signReadUrl(videoKey, 3600);
    return new NextResponse(null, {
      status: 302,
      headers: {
        location: url,
        // 重定向本身短缓存：换签 URL 随请求变化，客户端按原始 URL 缓存
        'cache-control': 'public, max-age=300',
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
