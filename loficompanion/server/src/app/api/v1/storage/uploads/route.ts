import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/server/auth';
import { getClientContext } from '@/server/client-context';
import { handleError, ok } from '@/server/http';
import { signUpload } from '@/server/storage';

const signUploadSchema = z.object({
  // Caller-chosen path within the bucket, e.g. "avatars/<userId>.jpg".
  // The server prepends the environment namespace, so callers stay simple.
  path: z.string().min(1).max(512).regex(/^[a-zA-Z0-9._\-/]+$/, {
    message: 'path 只能含字母、数字、点、短横、斜杠',
  }),
  contentType: z.string().min(1).max(200),
});

// Returns a presigned PUT URL the client uploads the file to directly.
// Bucket is selected by x-app-id (multi-tenant); object key is namespaced by
// x-app-environment. The client persists `downloadUrl`/`objectKey` as the
// reference (e.g. avatar_url) — never the raw bytes.
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const client = getClientContext(request);
    const input = signUploadSchema.parse(await request.json());
    const result = await signUpload({
      appId: user.app_id,
      environment: client.environment,
      path: input.path,
      contentType: input.contentType,
    });
    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
