import { NextRequest } from 'next/server';
import { adminContext } from '@/server/admin-auth';
import { publishDraft } from '@/server/config-control';
import { handleError, ok } from '@/server/http';

export async function POST(request: NextRequest) {
  try {
    const { scope } = await adminContext(request);
    const config = await publishDraft(scope, request.headers.get('x-admin-actor') ?? 'admin');
    return ok(config);
  } catch (error) {
    return handleError(error);
  }
}
