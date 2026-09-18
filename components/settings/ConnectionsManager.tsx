'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toaster';
import { formatDate } from '@/lib/datetime';

interface PublicConnection {
  service: string;
  label: string;
  createdAt: string;
}

interface ConnectionsResponse {
  connections: PublicConnection[];
  encryptionConfigured: boolean;
}

const SERVICE_META: Record<string, { icon: string; title: string }> = {
  github: { icon: 'bi-github', title: 'GitHub' },
  'google-gmail': { icon: 'bi-envelope-at', title: 'Gmail' },
};

function serviceMeta(service: string): { icon: string; title: string } {
  return SERVICE_META[service] ?? { icon: 'bi-plug', title: service };
}

/**
 * Settings panel for external service connections used by the agent (GitHub
 * PAT, Gmail OAuth). Secrets are stored encrypted server-side and never
 * displayed — only the label and created date.
 */
export function ConnectionsManager() {
  const { toast } = useToast();
  const [connections, setConnections] = useState<PublicConnection[]>([]);
  const [encryptionConfigured, setEncryptionConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [githubToken, setGithubToken] = useState('');
  const [adding, setAdding] = useState(false);
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [gmailConfigHint, setGmailConfigHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/connections');
      if (!res.ok) throw new Error('Failed to load connections.');
      const json = (await res.json()) as ConnectionsResponse;
      setConnections(json.connections);
      setEncryptionConfigured(json.encryptionConfigured);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load connections.', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Surface OAuth results after the Gmail redirect lands back on /settings.
  // (Read from window.location instead of useSearchParams to avoid requiring
  // a Suspense boundary in the parent page.)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const error = params.get('error');
    if (connected === 'google-gmail') {
      toast('Gmail connected successfully.', 'success');
    } else if (error) {
      toast(`Connection failed: ${error}`, 'error');
    }
    if (connected || error) {
      const url = new URL(window.location.href);
      url.searchParams.delete('connected');
      url.searchParams.delete('error');
      window.history.replaceState({}, '', url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAddGithub(e: React.FormEvent) {
    e.preventDefault();
    if (!githubToken.trim()) {
      toast('Enter a GitHub Personal Access Token.', 'error');
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: 'github', token: githubToken.trim() }),
      });
      const json = (await res.json()) as { label?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to add GitHub connection.');
      setGithubToken('');
      toast(`GitHub connected as ${json.label ?? 'your account'}.`, 'success');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to add GitHub connection.', 'error');
    } finally {
      setAdding(false);
    }
  }

  async function handleConnectGmail() {
    setConnectingGmail(true);
    setGmailConfigHint(null);
    try {
      // Probe first so a 503 (missing OAuth config) shows a hint instead of a
      // broken navigation; an opaque redirect means the flow is live.
      const res = await fetch('/api/connections/google/start', { redirect: 'manual' });
      if (res.status === 503) {
        const json = (await res.json()) as { error?: string };
        setGmailConfigHint(json.error ?? 'Google OAuth is not configured on this server.');
        return;
      }
      window.location.href = '/api/connections/google/start';
    } catch {
      // Some browsers throw on manual redirects — just navigate.
      window.location.href = '/api/connections/google/start';
    } finally {
      setConnectingGmail(false);
    }
  }

  async function handleDelete(service: string) {
    setDeleting(service);
    try {
      const res = await fetch(`/api/connections/${encodeURIComponent(service)}`, {
        method: 'DELETE',
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to remove connection.');
      toast(`Disconnected ${serviceMeta(service).title}.`, 'success');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to remove connection.', 'error');
    } finally {
      setDeleting(null);
    }
  }

  const hasGmail = connections.some((c) => c.service === 'google-gmail');

  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <i className="bi bi-plug text-lg text-ignite" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-content">Connections</h2>
      </div>

      {!encryptionConfigured && (
        <div
          className="mb-4 flex items-start gap-2 rounded-md border border-ignite/40 bg-ignite/10 px-3 py-2 text-xs text-ignite-light"
          role="alert"
        >
          <i className="bi bi-exclamation-triangle mt-0.5" aria-hidden="true" />
          <span>
            Encryption is not configured, so connections cannot be stored. Set{' '}
            <code className="font-mono">ENCRYPTION_KEY</code> (min 16 chars) in your environment and
            restart.
          </span>
        </div>
      )}

      <div className="mb-6">
        {loading ? (
          <div className="space-y-2" aria-hidden="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : connections.length === 0 ? (
          <p className="text-sm text-content-muted">
            No services connected yet. Connect GitHub or Gmail below so the agent can act on your
            behalf.
          </p>
        ) : (
          <ul className="divide-y divide-surface-3 rounded-md border border-surface-3">
            {connections.map((c) => {
              const meta = serviceMeta(c.service);
              return (
                <li key={c.service} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-3">
                    <i className={`bi ${meta.icon} text-content-muted`} aria-hidden="true" />
                    <span className="font-medium text-content">{meta.title}</span>
                    {c.label && <Badge tone="neutral">{c.label}</Badge>}
                    <span className="hidden text-xs text-content-muted sm:inline">
                      added {formatDate(c.createdAt)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleDelete(c.service)}
                    disabled={deleting === c.service}
                    aria-label={`Disconnect ${meta.title}`}
                    className="focus-ignite rounded-md p-1.5 text-content-muted transition-colors hover:bg-surface-2 hover:text-ignite disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deleting === c.service ? (
                      <Spinner />
                    ) : (
                      <i className="bi bi-trash" aria-hidden="true" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <form onSubmit={handleAddGithub} className="mb-6 space-y-2">
        <label htmlFor="github-pat" className="block text-xs text-content-muted">
          GitHub Personal Access Token
        </label>
        <div className="flex gap-2">
          <input
            id="github-pat"
            type="password"
            value={githubToken}
            onChange={(e) => setGithubToken(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="ghp_… or github_pat_…"
            disabled={!encryptionConfigured || adding}
            className="focus-ignite w-full rounded-md border border-surface-3 bg-surface-2 px-3 py-2 font-mono text-sm text-content placeholder:text-content-muted disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Button type="submit" variant="primary" disabled={adding || !encryptionConfigured}>
            {adding ? <Spinner /> : <i className="bi bi-github" aria-hidden="true" />}
            Add
          </Button>
        </div>
        <p className="text-xs text-content-muted">
          The token needs the <code className="font-mono">repo</code> scope for private
          repositories. It is stored encrypted (AES-256-GCM) and never shown again.
        </p>
      </form>

      <div className="space-y-2">
        {!hasGmail && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleConnectGmail()}
            disabled={connectingGmail || !encryptionConfigured}
          >
            {connectingGmail ? <Spinner /> : <i className="bi bi-envelope-at" aria-hidden="true" />}
            Connect Gmail
          </Button>
        )}
        {gmailConfigHint && (
          <div
            className="flex items-start gap-2 rounded-md border border-ignite/40 bg-ignite/10 px-3 py-2 text-xs text-ignite-light"
            role="alert"
          >
            <i className="bi bi-exclamation-triangle mt-0.5" aria-hidden="true" />
            <span>{gmailConfigHint}</span>
          </div>
        )}
        <p className="text-xs text-content-muted">
          Gmail lets the agent send email on your behalf (with your explicit approval every time).
          Only the encrypted OAuth refresh token is stored.
        </p>
      </div>
    </Card>
  );
}
