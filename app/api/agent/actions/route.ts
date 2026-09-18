import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { listAgentActions } from '@/lib/db/sql/client';
import { mapActionToView } from '@/lib/ai/agent/loop';

export const runtime = 'nodejs';

/**
 * GET /api/agent/actions?threadId=X — the agent activity log for a thread,
 * newest-first, as AgentActionView[] (payload/result parsed; the internal
 * paused-loop stateJson is never exposed).
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const threadId = req.nextUrl.searchParams.get('threadId');
  if (!threadId) {
    return NextResponse.json({ error: 'threadId query parameter is required.' }, { status: 400 });
  }

  const actions = (await listAgentActions(threadId, session.user.id)).map(mapActionToView);
  return NextResponse.json({ actions });
}
