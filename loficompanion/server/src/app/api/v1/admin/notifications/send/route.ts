import { NextRequest } from 'next/server';
import { adminContext } from '@/server/admin-auth';
import { handleError, ok } from '@/server/http';
import { enqueueNotification } from '@/server/notification-jobs';
import { notificationJobSchema } from '@/server/schemas';

export async function POST(request: NextRequest) {
  try {
    const { scope } = await adminContext(request);
    const input = notificationJobSchema.parse(await request.json());
    return ok(await enqueueNotification({
      appId: scope.appId,
      environment: scope.environment,
      type: input.type,
      title: input.title,
      body: input.body,
      route: input.route ?? null,
    }), 202);
  } catch (error) {
    return handleError(error);
  }
}
