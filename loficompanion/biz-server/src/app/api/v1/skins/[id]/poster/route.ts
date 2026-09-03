import { NextResponse, type NextRequest } from 'next/server';
import { ApiError, handleError } from '@/lib/http';
import { getPublishedSkinPoster } from '@/features/skins/data/repository';
import { signReadUrl } from '@/features/skins/data/storage';

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';

// GET /api/v1/skins/{id}/poster —— 公开主题缩略图（302 → 对象存储）。
// 未登录可用、不走权益门禁：海报 objectKey 本就随公开目录（GET /v1/skins）
// 对所有人下发，属营销资产。房间卡/商店卡在皮肤 manifest 未就位（未购付费
// 皮肤/未拉取）时以此兜底渲染，保证每个主题都有可见封面。对象桶保持私有，
// 这里只签短时效 presigned GET；配置 S3_PUBLIC_BASE 时直接 302 到公网 URL。
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const objectKey = await getPublishedSkinPoster(id);
    if (objectKey === null) {
      throw new ApiError(404, 'SKIN_NOT_FOUND', '皮肤不存在、未发布或无海报');
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
