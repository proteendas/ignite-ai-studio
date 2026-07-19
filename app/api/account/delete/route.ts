import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { deleteUserData } from '@/lib/db/sql/client';

/**
 * Irreversibly deletes the authenticated user's account and every row that
 * belongs to them (documents, chats, keys, preferences, logs, usage — and the
 * user row itself). The client signs the user out afterwards.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  deleteUserData(session.user.id);

  return NextResponse.json({ ok: true });
}
