import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import {
  getChatThread,
  updateChatThread,
  deleteChatThread,
  listThreadMessages,
} from '@/lib/db/sql/client';

export const runtime = 'nodejs';

interface PatchThreadBody {
  title?: string;
  pinned?: boolean;
}

/** GET /api/threads/[id] — return a thread plus its messages (owner-scoped). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const thread = await getChatThread(params.id);
  if (!thread || thread.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Thread not found.' }, { status: 404 });
  }

  const messages = await listThreadMessages(params.id);
  return NextResponse.json({ thread, messages });
}

/** PATCH /api/threads/[id] — rename and/or pin a thread (owner-scoped). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const thread = await getChatThread(params.id);
  if (!thread || thread.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Thread not found.' }, { status: 404 });
  }

  let body: PatchThreadBody;
  try {
    body = (await req.json()) as PatchThreadBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const updates: { title?: string; pinned?: boolean } = {};
  if (typeof body.title === 'string') {
    updates.title = body.title.trim();
  }
  if (typeof body.pinned === 'boolean') {
    updates.pinned = body.pinned;
  }

  if (updates.title === undefined && updates.pinned === undefined) {
    return NextResponse.json(
      { error: 'Provide at least one of: title, pinned.' },
      { status: 400 }
    );
  }

  await updateChatThread(params.id, updates);
  const updated = await getChatThread(params.id);
  return NextResponse.json({ thread: updated });
}

/** DELETE /api/threads/[id] — delete a thread and its messages (owner-scoped). */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const thread = await getChatThread(params.id);
  if (!thread || thread.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Thread not found.' }, { status: 404 });
  }

  await deleteChatThread(params.id);
  return NextResponse.json({ ok: true });
}
