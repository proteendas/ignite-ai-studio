import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import {
  listGeneratedContent,
  saveGeneratedContent,
  type GeneratedContentRecord,
} from '@/lib/db/sql/client';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'nodejs';

interface SaveContentBody {
  documentId?: string | null;
  contentType?: string;
  tone?: string;
  channel?: string;
  output?: string;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const items = listGeneratedContent(session.user.id);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const ownerId = session.user.id;

  let body: SaveContentBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { documentId, contentType, tone, channel, output } = body;
  if (!contentType || !tone || !channel || !output) {
    return NextResponse.json(
      { error: 'contentType, tone, channel, and output are required.' },
      { status: 400 }
    );
  }

  const id = uuidv4();
  saveGeneratedContent({
    id,
    ownerId,
    documentId: documentId ?? null,
    contentType,
    tone,
    channel,
    output,
  });

  const saved: GeneratedContentRecord = {
    id,
    ownerId,
    documentId: documentId ?? null,
    contentType,
    tone,
    channel,
    output,
    createdAt: new Date().toISOString(),
  };

  return NextResponse.json({ item: saved }, { status: 201 });
}
