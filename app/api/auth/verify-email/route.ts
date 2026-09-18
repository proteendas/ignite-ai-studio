import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { consumeAuthToken, markEmailVerified } from '@/lib/db/sql/client';
import { hashToken } from '@/lib/auth/tokens';
import { checkRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';

const schema = z.object({ token: z.string().min(1) });

/** Redeems an email-verification token and stamps users.email_verified_at. */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const limit = checkRateLimit(`verify-email:${ip}`, { limit: 10, windowMs: 15 * 60_000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
  }

  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Missing verification token.' }, { status: 400 });
    }

    const ownerId = consumeAuthToken(hashToken(parsed.data.token), 'email_verification');
    if (!ownerId) {
      return NextResponse.json(
        { error: 'This verification link is invalid or has expired. Request a new one.' },
        { status: 400 }
      );
    }

    markEmailVerified(ownerId);
    return NextResponse.json({ message: 'Email verified.' });
  } catch (err) {
    console.error('Error verifying email:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
