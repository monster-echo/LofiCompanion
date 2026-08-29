import { NextRequest } from 'next/server';
import { z } from 'zod';
import { setAdminCookie } from '@/server/admin-auth';
import { createSession, verifyAdminCredentials } from '@/server/admin-identity';
import { appExists } from '@/server/tenant-repository';
import { ApiError, handleError, ok } from '@/server/http';

const schema = z.object({
  identifier: z.string().trim().min(1, '请输入账号'),
  password: z.string().min(1, '请输入密码'),
  appId: z.string().trim().min(1, '请选择 app_id'),
});

export async function POST(request: NextRequest) {
  try {
    const input = schema.parse(await request.json());
    if (!await appExists(input.appId)) {
      throw new ApiError(404, 'APP_NOT_FOUND', 'app_id 不存在，请确认后重试');
    }
    const admin = await verifyAdminCredentials(input.identifier, input.password);
    if (!admin) throw new ApiError(401, 'INVALID_CREDENTIALS', '账号或密码错误');
    const { token } = await createSession(admin.id, input.appId);
    await setAdminCookie(token);
    return ok({ ...admin, appId: input.appId });
  } catch (error) {
    return handleError(error);
  }
}
