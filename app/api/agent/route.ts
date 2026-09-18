import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { v4 as uuidv4 } from 'uuid';
import { authOptions } from '@/lib/auth/config';
import { resolveProvider } from '@/lib/ai/providerAdapter';
import { ensureThread } from '@/lib/db/chatHistory';
import { insertChatMessage } from '@/lib/db/sql/client';
import { checkRateLimit } from '@/lib/rateLimit';
import { createAgentSseStream, createInitialState } from '@/lib/ai/agent/loop';

export const runtime = 'nodejs';
// The ReAct loop may run several tool calls before answering.
// Vercel caps serverless functions at 10s by default (60s on Hobby without this,
// 300s on Pro); other platforms ignore it.
export const maxDuration = 300;

interface AgentRequestBody {
  message?: unknown;
  threadId?: unknown;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const ownerId = session.user.id;

  const rl = await checkRateLimit(`agent:${ownerId}`, { limit: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded, try again shortly.' }, { status: 429 });
  }

  let body: AgentRequestBody;
  try {
    body = (await req.json()) as AgentRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const threadId = typeof body.threadId === 'string' ? body.threadId : '';
  if (!message) {
    return NextResponse.json({ error: 'message is required.' }, { status: 400 });
  }
  if (!threadId) {
    return NextResponse.json({ error: 'threadId is required.' }, { status: 400 });
  }

  let provider;
  try {
    provider = await resolveProvider(ownerId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'No AI provider configured.';
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  // Must complete before the first message insert, or the thread row is missing.
  await ensureThread(threadId, ownerId);
  await insertChatMessage({
    id: uuidv4(),
    threadId,
    role: 'user',
    content: message,
    metaJson: JSON.stringify({ route: 'agent' }),
    tokenCount: Math.ceil(message.length / 4),
  });

  const stream = createAgentSseStream({
    provider,
    ownerId,
    threadId,
    state: createInitialState(message),
    route: '/api/agent',
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
