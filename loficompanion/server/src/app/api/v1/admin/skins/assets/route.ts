import { NextRequest } from 'next/server';
import { z } from 'zod';
import { adminContext } from '@/server/admin-auth';
import { handleError, ok } from '@/server/http';
import { signSkinAssetUpload } from '@/features/skins/data/skin-publish-service';

const signSchema = z.object({
  path: z.string().min(1).max(512).regex(/^[a-zA-Z0-9._\-/]+$/, {
    message: 'path 只能含字母、数字、点、短横、斜杠',
  }),
  contentType: z.string().min(1).max(200),
});

// 皮肤海报直传签名：与 /storage/uploads 同为 presigned PUT，但走 admin 作用域
// （requireAuth 是终端用户通道；皮肤资产由发布脚本以控制台身份上传，服务器
// 依然独占 S3 凭据）。path 会自动冠上 <appId>/<environment>/ 租户前缀。
export async function POST(request: NextRequest) {
  try {
    const { scope } = await adminContext(request);
    const input = signSchema.parse(await request.json());
    const result = await signSkinAssetUpload(scope, input);
    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
