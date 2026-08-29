import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth';
import { database, nowIso } from '@/server/database';
import { handleError, ok } from '@/server/http';

type ReferralRow = { code: string; invited: number };

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const code = referralCode(user.app_id, user.id);
    await database.prepare(`
      INSERT INTO referral_profiles(user_id, code, created_at)
      VALUES (?, ?, ?) ON CONFLICT DO NOTHING
    `).run(user.id, code, nowIso());
    const row = await database.prepare(`
      SELECT referral_profiles.code,
        (SELECT COUNT(*) FROM users invited
          WHERE invited.app_id = ? AND invited.settings LIKE '%' || referral_profiles.code || '%'
        ) AS invited
      FROM referral_profiles WHERE user_id = ?
    `).get(user.app_id, user.id) as ReferralRow;
    const origin =
      process.env.AUTH_PUBLIC_ORIGIN ??
      process.env.MOBILEUI_PUBLIC_ORIGIN ??
      'https://example.com';
    return ok({ code: row.code, invited: Number(row.invited), shareUrl: `${origin}/invite/${row.code}` });
  } catch (error) {
    return handleError(error);
  }
}

function referralCode(appId: string, userId: string) {
  return createHash('sha256').update(`${appId}:${userId}`).digest('hex').slice(0, 8).toUpperCase();
}
