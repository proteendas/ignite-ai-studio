'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toaster';
import type { Tone } from '@/lib/types';

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

const TONES: Tone[] = ['professional', 'casual', 'technical', 'persuasive', 'formal', 'playful'];

const AUTO = 'auto';

interface Preferences {
  defaultProvider: string | null;
  defaultModel: string | null;
  defaultTone: string;
  theme: string;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function PreferencesForm() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState<string>(AUTO);
  const [model, setModel] = useState('');
  const [tone, setTone] = useState<string>('professional');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/preferences')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load preferences.');
        return (await res.json()) as { preferences: Preferences };
      })
      .then(({ preferences }) => {
        if (cancelled) return;
        setProvider(preferences.defaultProvider ?? AUTO);
        setModel(preferences.defaultModel ?? '');
        setTone(preferences.defaultTone || 'professional');
      })
      .catch((err: unknown) => {
        if (!cancelled) toast(err instanceof Error ? err.message : 'Failed to load preferences.', 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultProvider: provider === AUTO ? null : provider,
          defaultModel: model.trim() || null,
          defaultTone: tone,
        }),
      });
      if (!res.ok) throw new Error('Failed to save preferences.');
      toast('Preferences saved.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save preferences.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <i className="bi bi-gear text-lg text-ignite" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-content">Preferences</h2>
      </div>

      {loading ? (
        <div className="space-y-3" aria-hidden="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="pref-provider" className="mb-1 block text-xs text-content-muted">
                Default provider
              </label>
              <select
                id="pref-provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="focus-ignite w-full rounded-md border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-content"
              >
                <option value={AUTO}>Auto (best available)</option>
                {PROVIDER_IDS.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="pref-tone" className="mb-1 block text-xs text-content-muted">
                Default tone
              </label>
              <select
                id="pref-tone"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="focus-ignite w-full rounded-md border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-content"
              >
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {titleCase(t)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="pref-model" className="mb-1 block text-xs text-content-muted">
              Default model
            </label>
            <input
              id="pref-model"
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Leave blank for the provider default"
              spellCheck={false}
              className="focus-ignite w-full rounded-md border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-content placeholder:text-content-muted"
            />
          </div>

          <div className="flex items-center justify-end">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? <Spinner /> : <i className="bi bi-gear" aria-hidden="true" />}
              Save preferences
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
