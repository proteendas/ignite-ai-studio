import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserByEmail } from '@/lib/db/sql/client';
import { issueToken, buildActionUrl, ttlLabel } from '@/lib/auth/tokens';
import { sendEmail } from '@/lib/email/mailer';
import { checkRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';

const schema = z.object({ email: z.string().trim().email() });

/**
 * Starts a password reset.
 *
 * Always answers 200 with the same body whether or not the address is
 * registered — otherwise this endpoint becomes an account-enumeration oracle.
 * The work (and the email) only happens for a real credentials user.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const limit = checkRateLimit(`forgot-password:${ip}`, { limit: 5, windowMs: 15 * 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many reset requests. Please try again later.' },
      { status: 429 }
    );
  }

  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }

    const user = getUserByEmail(parsed.data.email);

    // OAuth-only accounts have no password to reset; treat them like unknown
    // addresses so we still reveal nothing.
    if (user?.passwordHash) {
      const token = issueToken(user.id, 'password_reset');
      const url = buildActionUrl('/reset-password', token);
      await sendEmail({
        to: user.email,
        subject: 'Reset your IgniteAI Studio password',
        text:
          `Someone requested a password reset for your IgniteAI Studio account.\n\n` +
          `Open this link to choose a new password — it expires in ${ttlLabel('password_reset')} ` +
          `and can only be used once:\n\n${url}\n\n` +
          `If this wasn't you, no action is needed and your password stays unchanged.`,
      });
    }

    return NextResponse.json({
      message: 'If an account exists for that address, a reset link is on its way.',
    });
  } catch (err) {
    console.error('Error starting password reset:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
