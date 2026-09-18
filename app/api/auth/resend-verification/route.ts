import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { getUserById } from '@/lib/db/sql/client';
import { issueToken, buildActionUrl, ttlLabel } from '@/lib/auth/tokens';
import { sendEmail, isEmailConfigured } from '@/lib/email/mailer';
import { checkRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';

/**
 * Sends (or re-sends) the verification link for the signed-in user's own
 * address. Session-scoped rather than email-scoped, so it cannot be used to
 * spam an arbitrary inbox.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  const ownerId = session?.user?.id;
  if (!ownerId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limit = checkRateLimit(`resend-verification:${ownerId}`, {
    limit: 3,
    windowMs: 15 * 60_000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Verification email already sent. Please wait a few minutes before retrying.' },
      { status: 429 }
    );
  }

  try {
    const user = getUserById(ownerId);
    if (!user) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }
    if (user.emailVerifiedAt) {
      return NextResponse.json({ message: 'This address is already verified.', verified: true });
    }

    const token = issueToken(user.id, 'email_verification');
    const url = buildActionUrl('/verify-email', token);
    const result = await sendEmail({
      to: user.email,
      subject: 'Verify your IgniteAI Studio email',
      text:
        `Confirm this address to finish setting up your IgniteAI Studio account.\n\n` +
        `This link expires in ${ttlLabel('email_verification')} and can only be used once:\n\n${url}`,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: 'Could not send the verification email. Try again shortly.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      message: isEmailConfigured()
        ? 'Verification email sent.'
        : 'Email delivery is not configured — the verification link was written to the server log.',
      delivered: isEmailConfigured(),
    });
  } catch (err) {
    console.error('Error resending verification email:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
