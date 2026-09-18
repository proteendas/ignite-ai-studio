import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import {
  getUsageSummary,
  listRequestLogs,
  listErrorLogs,
} from '@/lib/db/sql/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ownerId = session.user.id;

  return NextResponse.json({
    usage: await getUsageSummary(ownerId),
    requestLogs: await listRequestLogs(ownerId, 50),
    errorLogs: await listErrorLogs(ownerId, 50),
  });
}
