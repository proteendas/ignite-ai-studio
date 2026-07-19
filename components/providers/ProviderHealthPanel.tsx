'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

interface ProviderHealth {
  id: string;
  configured: boolean;
  source: 'user' | 'env' | null;
}

interface ProviderHealthResponse {
  providers: ProviderHealth[];
  activeChatProvider: string | null;
  activeEmbeddingsProvider: string | null;
  vectorDbProvider: string;
}

function sourceLabel(p: ProviderHealth): string {
  if (!p.configured) return 'Not configured';
  return p.source === 'user' ? 'User key' : 'Environment';
}

export function ProviderHealthPanel() {
  const [data, setData] = useState<ProviderHealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/provider-health')
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load provider health (${res.status}).`);
        return (await res.json()) as ProviderHealthResponse;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load provider health.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <i className="bi bi-shield-lock text-lg text-ignite" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-content">Provider health</h2>
      </div>

      {error ? (
        <p className="text-sm text-ignite-light" role="alert">
          {error}
        </p>
      ) : !data ? (
        <div className="space-y-2" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : (
        <>
          <dl className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-surface-3 bg-surface-2 p-3">
              <dt className="text-xs text-content-muted">Active chat provider</dt>
              <dd className="mt-1">
                {data.activeChatProvider ? (
                  <Badge tone="brand">{data.activeChatProvider}</Badge>
                ) : (
                  <Badge tone="danger">None</Badge>
                )}
              </dd>
            </div>
            <div className="rounded-md border border-surface-3 bg-surface-2 p-3">
              <dt className="text-xs text-content-muted">Active embeddings provider</dt>
              <dd className="mt-1">
                {data.activeEmbeddingsProvider ? (
                  <Badge tone="brand">{data.activeEmbeddingsProvider}</Badge>
                ) : (
                  <Badge tone="danger">None</Badge>
                )}
              </dd>
            </div>
            <div className="rounded-md border border-surface-3 bg-surface-2 p-3">
              <dt className="text-xs text-content-muted">Vector database</dt>
              <dd className="mt-1">
                <Badge tone="neutral">{data.vectorDbProvider}</Badge>
              </dd>
            </div>
          </dl>

          <ul className="divide-y divide-surface-3 rounded-md border border-surface-3">
            {data.providers.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <i
                    className={`bi bi-circle-fill text-[0.6rem] ${
                      p.configured ? 'text-emerald-500' : 'text-ignite'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="font-medium text-content">{p.id}</span>
                  <span className="sr-only">{p.configured ? 'configured' : 'not configured'}</span>
                </span>
                <span className="text-xs text-content-muted">{sourceLabel(p)}</span>
              </li>
            ))}
          </ul>

          <p className="mt-4 flex items-start gap-2 text-xs text-content-muted">
            <i className="bi bi-exclamation-triangle mt-0.5 text-ignite" aria-hidden="true" />
            <span>
              If a provider fails at request time, the app automatically fails over to the next
              configured provider in priority order.
            </span>
          </p>
        </>
      )}
    </Card>
  );
}
