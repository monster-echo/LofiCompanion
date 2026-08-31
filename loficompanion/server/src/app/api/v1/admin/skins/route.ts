import { NextRequest } from 'next/server';
import { adminContext } from '@/server/admin-auth';
import { handleError, ok } from '@/server/http';
import { listAllSkinsForAdmin } from '@/features/skins/data/skin-publish-service';

// 皮肤全量清单（含未发布/任意审核态）：发布脚本的 verify 步骤与控制台列表用。
// 与 GET /v1/skins（终端用户、仅已发布）不同，这里是管理视角。
export async function GET(request: NextRequest) {
  try {
    await adminContext(request);
    const skins = await listAllSkinsForAdmin();
    return ok({ skins });
  } catch (error) {
    return handleError(error);
  }
}
