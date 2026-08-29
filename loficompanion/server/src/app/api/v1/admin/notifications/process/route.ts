import { NextRequest } from 'next/server';
import { authorizeAdmin } from '@/server/admin-auth';
import { handleError, ok } from '@/server/http';
import { processNotificationJobs } from '@/server/notification-jobs';

export async function POST(request: NextRequest) {
  try {
    await authorizeAdmin(request);
    return ok(await processNotificationJobs());
  } catch (error) {
    return handleError(error);
  }
}
