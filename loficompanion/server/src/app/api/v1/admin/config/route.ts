import { NextRequest } from 'next/server';
import { getConfigDraft, getRuntimeConfig, saveConfigDraft } from '@/server/database';
import { adminContext } from '@/server/admin-auth';
import { handleError, ok } from '@/server/http';
import { runtimeConfigSchema } from '@/server/schemas';

export async function GET(request: NextRequest) {
  try {
    const { scope } = await adminContext(request);
    return ok({
      published: await getRuntimeConfig(scope.appId, scope.environment),
      draft: await getConfigDraft(scope.appId, scope.environment),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { scope } = await adminContext(request);
    const candidate = runtimeConfigSchema.parse(await request.json());
    await saveConfigDraft(candidate, scope.appId, scope.environment);
    return ok({ draft: candidate });
  } catch (error) {
    return handleError(error);
  }
}
