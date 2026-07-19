'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toaster';

/**
 * Hard-coded list of the registry's READ-ONLY tools. Write tools (email_send,
 * github_create_issue, github_comment_issue) are intentionally absent: they
 * always require explicit approval and can never be auto-approved.
 */
const READ_TOOLS: Array<{ name: string; title: string; description: string }> = [
  {
    name: 'github_get_file',
    title: 'Read GitHub files',
    description: 'Fetch the contents of a file from a repository.',
  },
  {
    name: 'github_list_issues',
    title: 'List GitHub issues',
    description: 'List the most recent issues in a repository.',
  },
  {
    name: 'github_list_prs',
    title: 'List GitHub pull requests',
    description: 'List the most recent pull requests in a repository.',
  },
  {
    name: 'github_commit_history',
    title: 'View GitHub commit history',
    description: 'Show recent commits for a repository or file.',
  },
];

/**
 * Per-tool auto-approve toggles for the agent's read-only tools. Persisted via
 * /api/preferences ({ autoApprove: Record<string, boolean> }); everything
 * defaults to off.
 */
export function AutoApproveSettings() {
  const { toast } = useToast();
  const [autoApprove, setAutoApprove] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/preferences');
      if (!res.ok) throw new Error('Failed to load preferences.');
      const json = (await res.json()) as { autoApprove?: Record<string, boolean> };
      setAutoApprove(json.autoApprove ?? {});
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load preferences.', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleToggle(toolName: string) {
    const next = { ...autoApprove, [toolName]: !autoApprove[toolName] };
    setSaving(toolName);
    setAutoApprove(next);
    try {
      const res = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoApprove: next }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error ?? 'Failed to save preference.');
      }
    } catch (err) {
      // Roll back the optimistic update.
      setAutoApprove(autoApprove);
      toast(err instanceof Error ? err.message : 'Failed to save preference.', 'error');
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <i className="bi bi-shield-check text-lg text-ignite" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-content">Agent auto-approve</h2>
      </div>
      <p className="mb-4 text-xs text-content-muted">
        Let the agent run selected read-only tools without asking each time. Write actions —
        sending emails, creating issues, posting comments — ALWAYS require your explicit approval,
        regardless of these settings.
      </p>

      {loading ? (
        <div className="space-y-2" aria-hidden="true">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <ul className="divide-y divide-surface-3 rounded-md border border-surface-3">
          {READ_TOOLS.map((tool) => {
            const enabled = autoApprove[tool.name] === true;
            return (
              <li key={tool.name} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-content">{tool.title}</p>
                  <p className="text-xs text-content-muted">
                    <span className="font-mono">{tool.name}</span> — {tool.description}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={`Auto-approve ${tool.title}`}
                  disabled={saving === tool.name}
                  onClick={() => void handleToggle(tool.name)}
                  className={`focus-ignite relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    enabled ? 'bg-ignite' : 'bg-surface-3'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
