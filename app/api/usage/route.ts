import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import {
  getUsageSummary,
  countDocuments,
  countGeneratedContent,
} from '@/lib/db/sql/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ownerId = session.user.id;
  return NextResponse.json({
    summary: getUsageSummary(ownerId),
    documents: countDocuments(ownerId),
    contentPieces: countGeneratedContent(ownerId),
  });
}
