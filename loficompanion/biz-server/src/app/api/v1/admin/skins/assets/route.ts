import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleError, ok } from '@/lib/http';
import { adminContext } from '@/lib/admin-auth';
import { signSkinAssetUpload } from '@/features/skins/data/repository';

const signSchema = z.object({
  path: z.string().min(1).max(512).regex(/^[a-zA-Z0-9._\-/]+$/, {
    message: 'path 只能含字母、数字、点、短横、斜杠',
  }),
  contentType: z.string().min(1).max(200),
});

// POST /api/v1/admin/skins/assets —— 皮肤海报直传签名：presigned PUT，走 admin
// 作用域（皮肤资产由发布脚本以管理身份上传，服务器独占 S3 凭据）。path 会自动
// 冠上 <appId>/<environment>/ 租户前缀。鉴权 = x-biz-key（BIZ_ADMIN_KEY）。
export async function POST(request: NextRequest) {
  try {
    const scope = await adminContext(request);
    const input = signSchema.parse(await request.json());
    const result = await signSkinAssetUpload(scope, input);
    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
