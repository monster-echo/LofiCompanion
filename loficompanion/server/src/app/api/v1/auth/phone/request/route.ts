import { NextRequest } from 'next/server';
import { getClientContext } from '@/server/client-context';
import { handleError, ok } from '@/server/http';
import { requestPhoneCode } from '@/server/phone-auth';
import { phoneCodeRequestSchema } from '@/server/schemas';

export async function POST(request: NextRequest) {
  try {
    const input = phoneCodeRequestSchema.parse(await request.json());
    const client = getClientContext(request);
    return ok(await requestPhoneCode(client.appId, input.phone), 202);
  } catch (error) {
    return handleError(error);
  }
}
