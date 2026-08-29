import { NextRequest } from 'next/server';
import { getUserRow, requireAuth, toPublicUser } from '@/server/auth';
import { database, nowIso } from '@/server/database';
import { ApiError, handleError, ok } from '@/server/http';
import { getClientContext } from '@/server/client-context';
import { settingsSchema } from '@/server/schemas';
import { getRuntimeConfig } from '@/server/database';

export async function GET(request: NextRequest) {
  try {
    return ok(toPublicUser((await requireAuth(request)).user).settings);
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const patch = settingsSchema.parse(await request.json());
    await assertWritable(user.app_id, getClientContext(request).environment, Object.keys(patch));
    const current = JSON.parse(user.settings) as Record<string, unknown>;
    await database.prepare(
      'UPDATE users SET settings = ?, updated_at = ? WHERE id = ?',
    ).run(JSON.stringify({ ...current, ...patch }), nowIso(), user.id);
    return ok(toPublicUser(await getUserRow(user.id)).settings);
  } catch (error) {
    return handleError(error);
  }
}

const settingPolicyMap: Readonly<Record<string, string>> = {
  theme: 'appearance',
  language: 'language',
  textScale: 'appearance',
  notificationsEnabled: 'notifications',
  marketingEnabled: 'notifications',
  analyticsEnabled: 'analytics',
  autoplayEnabled: 'general',
};

async function assertWritable(appId: string, environment: string, keys: readonly string[]) {
  const policies = (await getRuntimeConfig(appId, environment)).settingsPolicy;
  for (const key of keys) {
    const policy = policies[settingPolicyMap[key]];
    if (!policy || policy.visibility === 'hidden' || policy.mutability !== 'user') {
      throw new ApiError(403, 'SETTING_LOCKED', `设置 ${key} 不允许由用户修改`);
    }
  }
}
