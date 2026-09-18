import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { v4 as uuidv4 } from 'uuid';
import { authOptions } from '@/lib/auth/config';
import { listChatThreads, createChatThread } from '@/lib/db/sql/client';

export const runtime = 'nodejs';

interface CreateThreadBody {
  title?: string;
}

/** GET /api/threads — list the current user's chat threads (pinned first). */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const threads = await listChatThreads(session.user.id);
  return NextResponse.json({ threads });
}

/** POST /api/threads — create a new chat thread for the current user. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: CreateThreadBody = {};
  try {
    // Body is optional for thread creation; tolerate an empty/invalid payload.
    body = (await req.json()) as CreateThreadBody;
  } catch {
    body = {};
  }

  const title =
    typeof body.title === 'string' && body.title.trim() ? body.title.trim() : null;

  const thread = await createChatThread({
    id: uuidv4(),
    ownerId: session.user.id,
    title,
  });

  return NextResponse.json({ thread }, { status: 201 });
}
