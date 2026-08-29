import { NextRequest } from 'next/server';
import { z } from 'zod';
import { adminContext, setAdminCookie } from '@/server/admin-auth';
import { adminExists, createAdmin, createSession } from '@/server/admin-identity';
import { appExists } from '@/server/tenant-repository';
import { ApiError, handleError, ok } from '@/server/http';

const schema = z.object({
  username: z.string().trim().min(3, '用户名至少 3 位').max(32),
  email: z.email('邮箱格式不正确'),
  password: z.string().min(8, '密码至少 8 位').max(128),
  // 仅首个管理员（bootstrap）自助注册并自动登录时需要，用于绑定会话的 app_id。
  appId: z.string().trim().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const input = schema.parse(await request.json());
    const bootstrap = !await adminExists();
    if (bootstrap) {
      if (!input.appId) {
        throw new ApiError(400, 'APP_ID_REQUIRED', '请选择要绑定的 app_id');
      }
      if (!await appExists(input.appId)) {
        throw new ApiError(404, 'APP_NOT_FOUND', 'app_id 不存在，请确认后重试');
      }
    } else {
      // 已有管理员：必须是登录态管理员才能创建新管理员（邀请制）。
      await adminContext(request);
    }
    const profile = await createAdmin(input);
    if (bootstrap) {
      const { token } = await createSession(profile.id, input.appId as string);
      await setAdminCookie(token);
      return ok({ profile, autoLogin: true }, 201);
    }
    return ok({ profile, autoLogin: false });
  } catch (error) {
    return handleError(error);
  }
}
