import { ok } from '@/server/http';

export function GET() {
  return ok({ status: 'live', timestamp: new Date().toISOString() });
}

