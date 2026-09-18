import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { getDocumentById, deleteDocument } from '@/lib/db/sql/client';
import { getVectorStore } from '@/lib/db/vector';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const doc = await getDocumentById(params.id);
  if (!doc || doc.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  return NextResponse.json({ document: doc });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const doc = await getDocumentById(params.id);
  if (!doc || doc.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  const vectorStore = getVectorStore();
  await vectorStore.deleteDocument(params.id);
  await deleteDocument(params.id);

  return NextResponse.json({ ok: true });
}
