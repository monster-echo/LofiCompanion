import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleError, ok } from '@/server/http';
import { ApiError } from '@/server/http';
import { database } from '@/server/database';

// 服务间资料查询（biz-server 专用）：好友/榜单等业务在 biz 侧，但昵称/头像
// 是身份域数据。以共享密钥鉴权（INTERNAL_API_KEY，两侧 env 对齐），批量上限
// 200；nickname 归一口径与站内一致：COALESCE(NULLIF(display_name,''), username)。

const querySchema = z.object({
  ids: z.string().min(1).max(200 * 40),
});

export async function GET(request: NextRequest) {
  try {
    const expected = process.env.INTERNAL_API_KEY?.trim();
    if (!expected || request.headers.get('x-internal-key') !== expected) {
      throw new ApiError(401, 'UNAUTHORIZED', '内部接口鉴权失败');
    }
    // Next 16：nextUrl 在部分运行时下不可靠，直接从 request.url 解析
  const { ids } = querySchema.parse({ ids: new URL(request.url).searchParams.get('ids') ?? '' });
    const list = [...new Set(ids.split(',').map((id) => id.trim()).filter(Boolean))];
    if (list.length === 0 || list.length > 200) {
      throw new ApiError(400, 'INVALID_IDS', 'ids 需为 1–200 个用户 id');
    }
    const placeholders = list.map(() => '?').join(', ');
    const rows = await database.prepare(
      `SELECT id, COALESCE(NULLIF(display_name, ''), username) AS nickname, avatar_url
       FROM users WHERE id IN (${placeholders})`,
    ).all(...list) as Array<{ id: string; nickname: string; avatar_url: string | null }>;
    return ok({
      profiles: rows.map((row) => ({
        id: row.id,
        nickname: row.nickname,
        avatarUrl: row.avatar_url,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}
