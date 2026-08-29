import { NextRequest } from 'next/server';
import { handleError, ok } from '@/server/http';
import { applyWebhook } from '@/server/webhook-service';

export async function POST(request: NextRequest) {
  try {
    const rawBody = Buffer.from(await request.text());
    const headers = Object.fromEntries(request.headers.entries());
    const result = await applyWebhook('google', rawBody, headers);
    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
