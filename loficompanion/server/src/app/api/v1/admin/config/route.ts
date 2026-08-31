import { NextRequest } from 'next/server';
import { defaultConfig } from '@/domain/config';
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
    // theme 逐键可选（schema .partial()）：落库前补齐默认色板，草稿文档始终完整
    const draft = { ...candidate, theme: { ...defaultConfig.theme, ...candidate.theme } };
    await saveConfigDraft(draft, scope.appId, scope.environment);
    return ok({ draft });
  } catch (error) {
    return handleError(error);
  }
}
