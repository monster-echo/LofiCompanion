import { NextRequest } from 'next/server';
import { z } from 'zod';
import { adminContext } from '@/server/admin-auth';
import { handleError, ok } from '@/server/http';
import { listLogs } from '@/server/telemetry-repository';

const querySchema = z.object({
  name: z.string().trim().optional(),
  platform: z.string().trim().optional(),
  since: z.coerce.number().int().min(1).max(60 * 24 * 30).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: NextRequest) {
  try {
    const { scope } = await adminContext(request);
    const filters = querySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    return ok({
      rows: await listLogs(scope, {
        name: filters.name,
        platform: filters.platform,
        sinceMinutes: filters.since,
        limit: filters.limit,
        offset: filters.offset,
      }),
    });
  } catch (error) {
    return handleError(error);
  }
}
