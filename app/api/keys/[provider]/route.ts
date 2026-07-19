import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { deleteUserApiKey } from '@/lib/db/sql/client';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { provider: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  deleteUserApiKey(session.user.id, params.provider);

  return NextResponse.json({ ok: true });
}
