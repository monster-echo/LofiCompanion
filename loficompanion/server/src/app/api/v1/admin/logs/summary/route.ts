import { NextRequest } from 'next/server';
import { z } from 'zod';
import { adminContext } from '@/server/admin-auth';
import { handleError, ok } from '@/server/http';
import { getLogSummary } from '@/server/telemetry-repository';

const querySchema = z.object({
  since: z.coerce.number().int().min(1).max(60 * 24 * 30).default(60 * 24),
});

export async function GET(request: NextRequest) {
  try {
    const { scope } = await adminContext(request);
    const { since } = querySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    return ok(await getLogSummary(scope, since));
  } catch (error) {
    return handleError(error);
  }
}
