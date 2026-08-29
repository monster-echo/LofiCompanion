import { NextResponse } from 'next/server';
import { getJwks } from '@/server/jwt';

export async function GET() {
  return NextResponse.json(await getJwks());
}