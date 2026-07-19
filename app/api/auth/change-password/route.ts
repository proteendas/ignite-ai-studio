import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth/config';
import { getUserById, updateUserPassword } from '@/lib/db/sql/client';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { checkRateLimit } from '@/lib/rateLimit';

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8, 'New password must be at least 8 characters.'),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rate = checkRateLimit(`user:${session.user.id}:change-password`, {
      limit: 5,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again in a minute.' },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const message = firstIssue
        ? `${firstIssue.path.join('.') || 'input'}: ${firstIssue.message}`
        : 'Invalid request.';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { currentPassword, newPassword } = parsed.data;

    const user = getUserById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    if (!user.passwordHash) {
      return NextResponse.json(
        { error: 'This account signs in with Google/GitHub and has no password.' },
        { status: 400 }
      );
    }

    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: 'Current password is incorrect.' },
        { status: 400 }
      );
    }

    const newHash = await hashPassword(newPassword);
    updateUserPassword(user.id, newHash);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Error changing password:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
