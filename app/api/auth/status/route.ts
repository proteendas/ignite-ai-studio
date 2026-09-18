import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { getUserById } from '@/lib/db/sql/client';

export const runtime = 'nodejs';

/** Lightweight account state for the verification banner and account settings. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const ownerId = session?.user?.id;
  if (!ownerId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = getUserById(ownerId);
  if (!user) {
    return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
  }

  return NextResponse.json({
    email: user.email,
    name: user.name,
    provider: user.provider,
    emailVerified: Boolean(user.emailVerifiedAt),
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
  });
}
