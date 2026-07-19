'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { AgentActionView } from '@/lib/types';

interface AgentApprovalCardProps {
  action: AgentActionView;
  busy?: boolean;
  onApprove: (editedPayload?: Record<string, unknown>) => void;
  onReject: () => void;
}

function toolIcon(tool: string): string {
  if (tool.startsWith('github_')) return 'bi-github';
  if (tool === 'email_send') return 'bi-envelope-arrow-up';
  return 'bi-tools';
}

const STATUS_BADGE: Record<
  Exclude<AgentActionView['status'], 'proposed'>,
  { tone: 'neutral' | 'success' | 'warning' | 'danger' | 'brand'; icon: string; label: string }
> = {
  approved: { tone: 'brand', icon: 'bi-check-circle', label: 'Approved' },
  rejected: { tone: 'neutral', icon: 'bi-x-circle', label: 'Rejected' },
  executed: { tone: 'success', icon: 'bi-check-circle-fill', label: 'Executed' },
  failed: { tone: 'danger', icon: 'bi-exclamation-octagon', label: 'Failed' },
};

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

/**
 * Human-in-the-loop approval card for a proposed agent action. For email_send
 * the draft (to/subject/body) is editable before approval; the edited payload
 * is passed to onApprove.
 */
export function AgentApprovalCard({ action, busy = false, onApprove, onReject }: AgentApprovalCardProps) {
  const isEmail = action.tool === 'email_send';
  const [editing, setEditing] = useState(false);
  const [to, setTo] = useState(String(action.payload.to ?? ''));
  const [subject, setSubject] = useState(String(action.payload.subject ?? ''));
  const [body, setBody] = useState(String(action.payload.body ?? ''));

  const pending = action.status === 'proposed';
  const statusBadge = action.status === 'proposed' ? null : STATUS_BADGE[action.status];

  function handleApprove() {
    if (isEmail && editing) {
      onApprove({ to: to.trim(), subject: subject.trim(), body });
    } else {
      onApprove();
    }
  }

  return (
    <div className="rounded-lg border border-ignite/40 bg-surface-1 p-4 shadow-glow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-ignite/15">
            <i className={`bi ${toolIcon(action.tool)} text-ignite-light`} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-medium text-content">{action.summary}</p>
            <p className="text-xs text-content-muted">
              Tool: <span className="font-mono">{action.tool}</span>
            </p>
          </div>
        </div>
        {statusBadge ? (
          <Badge tone={statusBadge.tone}>
            <i className={`bi ${statusBadge.icon}`} aria-hidden="true" />
            {statusBadge.label}
          </Badge>
        ) : (
          <Badge tone="warning">
            <i className="bi bi-hourglass-split" aria-hidden="true" />
            Awaiting approval
          </Badge>
        )}
      </div>

      {isEmail && editing && pending ? (
        <div className="mb-4 space-y-3">
          <div>
            <label htmlFor={`email-to-${action.id}`} className="mb-1 block text-xs text-content-muted">
              To
            </label>
            <input
              id={`email-to-${action.id}`}
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={busy}
              className="focus-ignite w-full rounded-md border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-content disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor={`email-subject-${action.id}`} className="mb-1 block text-xs text-content-muted">
              Subject
            </label>
            <input
              id={`email-subject-${action.id}`}
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={busy}
              className="focus-ignite w-full rounded-md border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-content disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor={`email-body-${action.id}`} className="mb-1 block text-xs text-content-muted">
              Body
            </label>
            <textarea
              id={`email-body-${action.id}`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              disabled={busy}
              className="focus-ignite w-full rounded-md border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-content disabled:opacity-50"
            />
          </div>
        </div>
      ) : (
        <dl className="mb-4 space-y-2 rounded-md border border-surface-3 bg-surface-2 p-3">
          {Object.entries(action.payload).map(([key, value]) => (
            <div key={key}>
              <dt className="text-xs font-medium uppercase tracking-wide text-content-muted">{key}</dt>
              <dd className="whitespace-pre-wrap break-words text-sm text-content">
                {formatValue(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {pending && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="primary" disabled={busy} onClick={handleApprove}>
            <i className="bi bi-check-lg" aria-hidden="true" />
            Approve
          </Button>
          {isEmail && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setEditing((v) => !v)}
            >
              <i className="bi bi-pencil" aria-hidden="true" />
              {editing ? 'Preview' : 'Edit'}
            </Button>
          )}
          <Button type="button" variant="ghost" disabled={busy} onClick={onReject}>
            <i className="bi bi-x-lg" aria-hidden="true" />
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
