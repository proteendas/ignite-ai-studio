'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import type { AgentActionView } from '@/lib/types';
import { formatDateTime } from '@/lib/datetime';

interface AgentActivityLogProps {
  threadId: string;
  refreshSignal?: number;
}

const STATUS_BADGE: Record<
  AgentActionView['status'],
  { tone: 'neutral' | 'success' | 'warning' | 'danger' | 'brand'; label: string }
> = {
  proposed: { tone: 'warning', label: 'Proposed' },
  approved: { tone: 'brand', label: 'Approved' },
  rejected: { tone: 'neutral', label: 'Rejected' },
  executed: { tone: 'success', label: 'Executed' },
  failed: { tone: 'danger', label: 'Failed' },
};

function toolIcon(tool: string): string {
  if (tool.startsWith('github_')) return 'bi-github';
  if (tool === 'email_send') return 'bi-envelope-arrow-up';
  return 'bi-tools';
}

/**
 * Audit trail of agent actions for a thread (newest first). Self-fetches from
 * GET /api/agent/actions and re-fetches whenever refreshSignal changes.
 */
export function AgentActivityLog({ threadId, refreshSignal }: AgentActivityLogProps) {
  const [actions, setActions] = useState<AgentActionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/agent/actions?threadId=${encodeURIComponent(threadId)}`);
      const json = (await res.json()) as { actions?: AgentActionView[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to load agent actions.');
      setActions(json.actions ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agent actions.');
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  if (loading) {
    return (
      <div className="space-y-2" aria-hidden="true">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="flex items-center gap-2 text-sm text-ignite-light" role="alert">
        <i className="bi bi-exclamation-octagon" aria-hidden="true" />
        {error}
      </p>
    );
  }

  if (actions.length === 0) {
    return <p className="text-sm text-content-muted">No agent actions in this thread yet.</p>;
  }

  return (
    <ul className="divide-y divide-surface-3 rounded-md border border-surface-3 bg-surface-1">
      {actions.map((action) => {
        const badge = STATUS_BADGE[action.status];
        return (
          <li key={action.id} className="flex items-start gap-3 px-3 py-2.5">
            <i
              className={`bi ${toolIcon(action.tool)} mt-0.5 text-content-muted`}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={badge.tone}>{badge.label}</Badge>
                <span className="font-mono text-xs text-content-muted">{action.tool}</span>
              </div>
              <p className="mt-1 break-words text-sm text-content">{action.summary}</p>
              <p className="mt-0.5 text-xs text-content-muted">
                Created {formatDateTime(action.createdAt)}
                {action.decidedAt ? ` · Decided ${formatDateTime(action.decidedAt)}` : ''}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
