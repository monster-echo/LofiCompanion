import { NextRequest } from 'next/server';
import { z } from 'zod';
import { adminContext } from '@/server/admin-auth';
import { rollbackConfig } from '@/server/config-control';
import { handleError, ok } from '@/server/http';

const inputSchema = z.object({ version: z.number().int().positive() });

export async function POST(request: NextRequest) {
  try {
    const { scope } = await adminContext(request);
    const input = inputSchema.parse(await request.json());
    const config = await rollbackConfig(
      scope,
      input.version,
      request.headers.get('x-admin-actor') ?? 'admin',
    );
    return ok(config);
  } catch (error) {
    return handleError(error);
  }
}
