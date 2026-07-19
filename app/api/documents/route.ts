import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { listDocumentsByOwner } from '@/lib/db/sql/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const documents = listDocumentsByOwner(session.user.id);
  return NextResponse.json({ documents });
}
