import { NextRequest } from 'next/server';
import { getClientContext } from '@/server/client-context';
import { handleError, ok } from '@/server/http';
import { verifyPhoneCode } from '@/server/phone-auth';
import { phoneCodeVerifySchema } from '@/server/schemas';

export async function POST(request: NextRequest) {
  try {
    const input = phoneCodeVerifySchema.parse(await request.json());
    const client = getClientContext(request);
    return ok(await verifyPhoneCode(client.appId, input.phone, input.code, input.deviceName));
  } catch (error) {
    return handleError(error);
  }
}
