import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { v4 as uuidv4 } from 'uuid';
import { authOptions } from '@/lib/auth/config';
import { resolveProvider } from '@/lib/ai/providerAdapter';
import { getAgentAction, updateAgentAction, recordActivity } from '@/lib/db/sql/client';
import { getTool } from '@/lib/ai/tools/registry';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  buildObservationMessage,
  createAgentSseStream,
  executeToolForAction,
  type AgentLoopState,
} from '@/lib/ai/agent/loop';

export const runtime = 'nodejs';

interface DecisionBody {
  decision?: unknown;
  payload?: unknown;
}

/**
 * POST /api/agent/actions/[id] — approve or reject a proposed agent action,
 * then resume the paused ReAct loop from the persisted state. Responds with a
 * new SSE stream using the same event vocabulary as POST /api/agent
 * (meta, step, action_request, token, done, error); it may pause again with
 * another action_request.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const ownerId = session.user.id;

  const rl = checkRateLimit(`agent:${ownerId}`, { limit: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded, try again shortly.' }, { status: 429 });
  }

  let body: DecisionBody;
  try {
    body = (await req.json()) as DecisionBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const decision = body.decision;
  if (decision !== 'approve' && decision !== 'reject') {
    return NextResponse.json({ error: 'decision must be "approve" or "reject".' }, { status: 400 });
  }

  const action = getAgentAction(params.id);
  if (!action) {
    return NextResponse.json({ error: 'Action not found.' }, { status: 404 });
  }
  if (action.ownerId !== ownerId) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  if (action.status !== 'proposed') {
    return NextResponse.json(
      { error: `Action was already decided (status: ${action.status}).` },
      { status: 409 }
    );
  }

  const tool = getTool(action.tool);
  if (!tool) {
    return NextResponse.json(
      { error: `Tool "${action.tool}" is no longer registered.` },
      { status: 500 }
    );
  }

  let state: AgentLoopState | null = null;
  if (action.stateJson) {
    try {
      state = JSON.parse(action.stateJson) as AgentLoopState;
    } catch {
      state = null;
    }
  }
  if (!state || !Array.isArray(state.messages)) {
    return NextResponse.json(
      { error: 'The paused agent state for this action is missing or corrupt; it cannot be resumed.' },
      { status: 500 }
    );
  }

  let provider;
  try {
    provider = resolveProvider(ownerId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'No AI provider configured.';
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  if (decision === 'reject') {
    updateAgentAction(action.id, { status: 'rejected', decided: true });
    recordActivity({
      id: uuidv4(),
      ownerId,
      type: 'agent',
      summary: `Rejected agent action (${action.tool}): ${action.summary.slice(0, 80)}`,
    });
    state.messages.push({
      role: 'user',
      content: `Observation for ${action.tool}: The user rejected this action.`,
    });
  } else {
    // Approve — with an optionally edited payload (e.g. a tweaked email draft).
    let input: unknown;
    try {
      input = JSON.parse(action.payloadJson);
    } catch {
      input = {};
    }
    if (body.payload !== undefined) {
      const validation = tool.inputSchema.safeParse(body.payload);
      if (!validation.success) {
        const issues = validation.error.issues
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; ');
        return NextResponse.json({ error: `Edited payload is invalid: ${issues}` }, { status: 400 });
      }
      input = validation.data;
      updateAgentAction(action.id, { payloadJson: JSON.stringify(input) });
    }

    updateAgentAction(action.id, { status: 'approved', decided: true });
    recordActivity({
      id: uuidv4(),
      ownerId,
      type: 'agent',
      summary: `Approved agent action (${action.tool}): ${action.summary.slice(0, 80)}`,
    });

    const result = await executeToolForAction(action.id, tool, input, ownerId);
    state.messages.push(buildObservationMessage(action.tool, result));
  }

  const stream = createAgentSseStream({
    provider,
    ownerId,
    threadId: action.threadId,
    state,
    route: `/api/agent/actions/${action.id}`,
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
