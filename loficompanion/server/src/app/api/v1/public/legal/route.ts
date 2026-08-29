import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getPublicLegal } from '@/server/public-legal';
import { handleError, ok } from '@/server/http';

const querySchema = z.object({
  app: z.string().trim().min(1, '缺少 app 参数'),
  env: z.string().trim().optional().default('production'),
  type: z.string().trim().optional(),
  locale: z.string().trim().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const input = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return ok({ docs: await getPublicLegal(input.app, input.env, input.type, input.locale) });
  } catch (error) {
    return handleError(error);
  }
}
