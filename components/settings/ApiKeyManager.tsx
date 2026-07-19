'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toaster';

const PROVIDER_IDS = [
  'groq',
  'openai',
  'azure-openai',
  'mistral',
  'cerebras',
  'openrouter',
  'together',
  'github-models',
  'gemini',
  'cohere',
  'huggingface',
  'cloudflare-workers-ai',
] as const;

interface StoredKey {
  provider: string;
  keyPreview: string;
  createdAt: string;
}

interface KeysResponse {
  keys: StoredKey[];
  encryptionConfigured: boolean;
}

export function ApiKeyManager() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<StoredKey[]>([]);
  const [encryptionConfigured, setEncryptionConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<string>(PROVIDER_IDS[0]);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/keys');
      if (!res.ok) throw new Error('Failed to load API keys.');
      const json = (await res.json()) as KeysResponse;
      setKeys(json.keys);
      setEncryptionConfigured(json.encryptionConfigured);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load API keys.', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) {
      toast('Enter an API key to save.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: apiKey.trim() }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to save API key.');
      setApiKey('');
      setShowKey(false);
      toast(`Saved key for ${provider}.`, 'success');
      await loadKeys();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save API key.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(target: string) {
    setDeleting(target);
    try {
      const res = await fetch(`/api/keys/${encodeURIComponent(target)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete API key.');
      toast(`Removed key for ${target}.`, 'success');
      await loadKeys();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete API key.', 'error');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <i className="bi bi-key text-lg text-ignite" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-content">Provider API keys</h2>
      </div>

      {!encryptionConfigured && (
        <div
          className="mb-4 flex items-start gap-2 rounded-md border border-ignite/40 bg-ignite/10 px-3 py-2 text-xs text-ignite-light"
          role="alert"
        >
          <i className="bi bi-exclamation-triangle mt-0.5" aria-hidden="true" />
          <span>
            Encryption is not configured, so keys cannot be stored. Set{' '}
            <code className="font-mono">ENCRYPTION_KEY</code> (min 16 chars) in your environment and
            restart. Generate one with <code className="font-mono">openssl rand -base64 32</code>.
          </span>
        </div>
      )}

      <div className="mb-6">
        {loading ? (
          <div className="space-y-2" aria-hidden="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : keys.length === 0 ? (
          <p className="text-sm text-content-muted">
            No provider keys stored yet. Add one below to use your own credentials.
          </p>
        ) : (
          <ul className="divide-y divide-surface-3 rounded-md border border-surface-3">
            {keys.map((k) => (
              <li key={k.provider} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="flex items-center gap-3">
                  <span className="font-medium text-content">{k.provider}</span>
                  <Badge tone="neutral">
                    <span className="font-mono">{k.keyPreview}</span>
                  </Badge>
                </span>
                <button
                  type="button"
                  onClick={() => void handleDelete(k.provider)}
                  disabled={deleting === k.provider}
                  aria-label={`Delete API key for ${k.provider}`}
                  className="focus-ignite rounded-md p-1.5 text-content-muted transition-colors hover:bg-surface-2 hover:text-ignite disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deleting === k.provider ? (
                    <Spinner />
                  ) : (
                    <i className="bi bi-trash" aria-hidden="true" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="key-provider" className="mb-1 block text-xs text-content-muted">
              Provider
            </label>
            <select
              id="key-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="focus-ignite w-full rounded-md border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-content"
            >
              {PROVIDER_IDS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="key-value" className="mb-1 block text-xs text-content-muted">
              API key
            </label>
            <div className="relative">
              <input
                id="key-value"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-…"
                disabled={!encryptionConfigured}
                className="focus-ignite w-full rounded-md border border-surface-3 bg-surface-2 px-3 py-2 pr-10 font-mono text-sm text-content placeholder:text-content-muted disabled:cursor-not-allowed disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
                className="focus-ignite absolute inset-y-0 right-0 flex items-center px-3 text-content-muted hover:text-content"
              >
                <i className={`bi ${showKey ? 'bi-eye-slash' : 'bi-eye'}`} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end">
          <Button type="submit" variant="primary" disabled={saving || !encryptionConfigured}>
            {saving ? <Spinner /> : <i className="bi bi-key" aria-hidden="true" />}
            Save key
          </Button>
        </div>
        <p className="text-xs text-content-muted">
          Saving a provider that already has a key replaces it. Keys are encrypted at rest and never
          shown again in full.
        </p>
      </form>
    </Card>
  );
}
