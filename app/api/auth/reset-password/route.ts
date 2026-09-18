import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { consumeAuthToken, updateUserPassword, getUserById } from '@/lib/db/sql/client';
import { hashToken } from '@/lib/auth/tokens';
import { hashPassword } from '@/lib/auth/password';
import { sendEmail } from '@/lib/email/mailer';
import { checkRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

/** Completes a password reset by redeeming a single-use token. */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const limit = checkRateLimit(`reset-password:${ip}`, { limit: 10, windowMs: 15 * 60_000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
  }

  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
        { status: 400 }
      );
    }

    const ownerId = consumeAuthToken(hashToken(parsed.data.token), 'password_reset');
    if (!ownerId) {
      return NextResponse.json(
        { error: 'This reset link is invalid or has expired. Request a new one.' },
        { status: 400 }
      );
    }

    updateUserPassword(ownerId, await hashPassword(parsed.data.password));

    // Courtesy notification; a failure here must not fail the reset itself.
    const user = getUserById(ownerId);
    if (user) {
      await sendEmail({
        to: user.email,
        subject: 'Your IgniteAI Studio password was changed',
        text:
          `Your IgniteAI Studio password was just changed.\n\n` +
          `If you did not do this, reset your password immediately and review your ` +
          `account settings.`,
      }).catch(() => undefined);
    }

    return NextResponse.json({ message: 'Password updated. You can sign in now.' });
  } catch (err) {
    console.error('Error resetting password:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
