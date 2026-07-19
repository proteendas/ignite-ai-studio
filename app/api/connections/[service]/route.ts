import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { v4 as uuidv4 } from 'uuid';
import { authOptions } from '@/lib/auth/config';
import { deleteUserConnection, getUserConnection, recordActivity } from '@/lib/db/sql/client';

export const runtime = 'nodejs';

export async function DELETE(_req: NextRequest, { params }: { params: { service: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const ownerId = session.user.id;
  const service = params.service;

  const existing = getUserConnection(ownerId, service);
  if (!existing) {
    return NextResponse.json({ error: 'Connection not found.' }, { status: 404 });
  }

  deleteUserConnection(ownerId, service);
  recordActivity({
    id: uuidv4(),
    ownerId,
    type: 'connection',
    summary: `Disconnected ${service}`,
  });

  return NextResponse.json({ deleted: service });
}
