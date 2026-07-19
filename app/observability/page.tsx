'use client';

import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/layout/ProtectedShell';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

interface ProviderUsage {
  provider: string;
  promptTokens: number;
  completionTokens: number;
  requests: number;
}

interface UsageSummary {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalRequests: number;
  byProvider: ProviderUsage[];
}

interface ObservabilityResponse {
  usage: UsageSummary;
  requestLogs: Array<Record<string, unknown>>;
  errorLogs: Array<Record<string, unknown>>;
}

// Rough per-1M-token USD rates for providers that bill. Everything else is
// treated as free tier (community/free endpoints). Estimates only.
const COST_RATES: Record<string, { in: number; out: number }> = {
  openai: { in: 0.15, out: 0.6 },
  'azure-openai': { in: 0.15, out: 0.6 },
  mistral: { in: 0.2, out: 0.6 },
  gemini: { in: 0.075, out: 0.3 },
  cohere: { in: 0.15, out: 0.6 },
};

function estimateCost(u: ProviderUsage): string {
  const rate = COST_RATES[u.provider];
  if (!rate) return 'Free tier';
  const cost = (u.promptTokens / 1_000_000) * rate.in + (u.completionTokens / 1_000_000) * rate.out;
  if (cost <= 0) return 'Free tier';
  if (cost < 0.01) return '< $0.01';
  return `~$${cost.toFixed(2)}`;
}

function str(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  if (v === null || v === undefined) return '—';
  return String(v);
}

function num(row: Record<string, unknown>, key: string): number {
  const v = row[key];
  return typeof v === 'number' ? v : Number(v) || 0;
}

function fmtNumber(n: number): string {
  return n.toLocaleString('en-US');
}

export default function ObservabilityPage() {
  const [data, setData] = useState<ObservabilityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/observability')
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load observability data (${res.status}).`);
        return (await res.json()) as ObservabilityResponse;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load observability data.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const maxTokens =
    data?.usage.byProvider.reduce(
      (max, p) => Math.max(max, p.promptTokens + p.completionTokens),
      0
    ) ?? 0;

  return (
    <ProtectedShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-content">Observability</h1>
          <p className="mt-1 text-sm text-content-muted">
            Your token usage, request activity, and errors.
          </p>
        </div>

        {error ? (
          <Card>
            <p className="text-sm text-ignite-light" role="alert">
              {error}
            </p>
          </Card>
        ) : !data ? (
          <>
            <Card>
              <Skeleton className="mb-4 h-5 w-40" />
              <div className="space-y-2" aria-hidden="true">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            </Card>
            <Card>
              <Skeleton className="mb-4 h-5 w-40" />
              <Skeleton className="h-24 w-full" />
            </Card>
          </>
        ) : (
          <>
            {/* Usage summary */}
            <Card>
              <div className="mb-4 flex items-center gap-2">
                <i className="bi bi-graph-up text-lg text-ignite" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-content">Token usage by provider</h2>
              </div>

              <dl className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-surface-3 bg-surface-2 p-3">
                  <dt className="text-xs text-content-muted">Total requests</dt>
                  <dd className="mt-1 text-lg font-semibold text-content">
                    {fmtNumber(data.usage.totalRequests)}
                  </dd>
                </div>
                <div className="rounded-md border border-surface-3 bg-surface-2 p-3">
                  <dt className="text-xs text-content-muted">Prompt tokens</dt>
                  <dd className="mt-1 text-lg font-semibold text-content">
                    {fmtNumber(data.usage.totalPromptTokens)}
                  </dd>
                </div>
                <div className="rounded-md border border-surface-3 bg-surface-2 p-3">
                  <dt className="text-xs text-content-muted">Completion tokens</dt>
                  <dd className="mt-1 text-lg font-semibold text-content">
                    {fmtNumber(data.usage.totalCompletionTokens)}
                  </dd>
                </div>
              </dl>

              {data.usage.byProvider.length === 0 ? (
                <p className="text-sm text-content-muted">
                  No usage recorded yet. Token usage appears here after you chat or generate content.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-left text-sm">
                    <thead>
                      <tr className="border-b border-surface-3 text-xs text-content-muted">
                        <th className="py-2 pr-4 font-medium">Provider</th>
                        <th className="py-2 pr-4 font-medium">Tokens</th>
                        <th className="py-2 pr-4 font-medium">Requests</th>
                        <th className="py-2 font-medium">Cost estimate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.usage.byProvider.map((p) => {
                        const total = p.promptTokens + p.completionTokens;
                        const pct = maxTokens > 0 ? Math.max(4, (total / maxTokens) * 100) : 0;
                        return (
                          <tr key={p.provider} className="border-b border-surface-3/60">
                            <td className="py-2 pr-4 font-medium text-content">{p.provider}</td>
                            <td className="py-2 pr-4">
                              <div className="flex items-center gap-2">
                                <div
                                  className="h-2 rounded-full bg-ignite/60"
                                  style={{ width: `${pct}%`, minWidth: '0.5rem' }}
                                  aria-hidden="true"
                                />
                                <span className="whitespace-nowrap text-content-muted">
                                  {fmtNumber(total)}
                                </span>
                              </div>
                            </td>
                            <td className="py-2 pr-4 text-content-muted">{fmtNumber(p.requests)}</td>
                            <td className="py-2">
                              <Badge tone={COST_RATES[p.provider] ? 'brand' : 'success'}>
                                {estimateCost(p)}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="mt-3 text-xs text-content-muted">
                    Cost figures are rough estimates; free-tier and community endpoints show &ldquo;Free
                    tier&rdquo;.
                  </p>
                </div>
              )}
            </Card>

            {/* Request logs */}
            <Card>
              <div className="mb-4 flex items-center gap-2">
                <i className="bi bi-list-ul text-lg text-ignite" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-content">Recent requests</h2>
              </div>
              {data.requestLogs.length === 0 ? (
                <p className="text-sm text-content-muted">No request activity recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-left text-sm">
                    <thead>
                      <tr className="border-b border-surface-3 text-xs text-content-muted">
                        <th className="py-2 pr-4 font-medium">Route</th>
                        <th className="py-2 pr-4 font-medium">Status</th>
                        <th className="py-2 pr-4 font-medium">Provider</th>
                        <th className="py-2 font-medium">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.requestLogs.map((log, i) => {
                        const status = num(log, 'status');
                        const ok = status > 0 && status < 400;
                        return (
                          <tr key={str(log, 'id') + i} className="border-b border-surface-3/60">
                            <td className="py-2 pr-4 font-mono text-xs text-content">
                              {str(log, 'route')}
                            </td>
                            <td className="py-2 pr-4">
                              <Badge tone={ok ? 'success' : 'danger'}>{status || '—'}</Badge>
                            </td>
                            <td className="py-2 pr-4 text-content-muted">{str(log, 'provider')}</td>
                            <td className="py-2 whitespace-nowrap text-content-muted">
                              {str(log, 'created_at')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Error logs */}
            <Card>
              <div className="mb-4 flex items-center gap-2">
                <i className="bi bi-exclamation-triangle text-lg text-ignite" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-content">Recent errors</h2>
              </div>
              {data.errorLogs.length === 0 ? (
                <p className="text-sm text-content-muted">No errors recorded. Nice.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-left text-sm">
                    <thead>
                      <tr className="border-b border-surface-3 text-xs text-content-muted">
                        <th className="py-2 pr-4 font-medium">Route</th>
                        <th className="py-2 pr-4 font-medium">Message</th>
                        <th className="py-2 font-medium">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.errorLogs.map((log, i) => (
                        <tr key={str(log, 'id') + i} className="border-b border-surface-3/60">
                          <td className="py-2 pr-4 font-mono text-xs text-content">
                            {str(log, 'route')}
                          </td>
                          <td className="py-2 pr-4 text-ignite-light">{str(log, 'message')}</td>
                          <td className="py-2 whitespace-nowrap text-content-muted">
                            {str(log, 'created_at')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </ProtectedShell>
  );
}
