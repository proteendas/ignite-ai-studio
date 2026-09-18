'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Skeleton } from '@/components/ui/Skeleton';
import { Select } from '@/components/ui/Select';
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

type ConnectionType = 'cloud' | 'local' | 'auto';

interface Preferences {
  defaultProvider: string | null;
  defaultModel: string | null;
  defaultTone: string;
  theme: string;
  connectionType: ConnectionType;
}

const CONNECTION_TYPES: { value: ConnectionType; icon: string; title: string; description: string }[] = [
  {
    value: 'cloud',
    icon: 'bi-cloud',
    title: 'Cloud API',
    description: 'Key-based cloud providers (Groq, OpenAI, Gemini, ...).',
  },
  {
    value: 'local',
    icon: 'bi-pc-display',
    title: 'Local',
    description: 'Ollama on this machine — fully offline, no API key.',
  },
  {
    value: 'auto',
    icon: 'bi-arrow-left-right',
    title: 'Auto',
    description: 'Prefer local when detected, fall back to cloud.',
  },
];

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
  const [connectionType, setConnectionType] = useState<ConnectionType>('cloud');

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
        setConnectionType(preferences.connectionType || 'cloud');
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
          connectionType,
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
          <fieldset>
            <legend className="mb-2 block text-xs text-content-muted">Connection type</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {CONNECTION_TYPES.map((ct) => {
                const selected = connectionType === ct.value;
                return (
                  <label
                    key={ct.value}
                    className={`focus-ignite cursor-pointer rounded-md border p-3 transition-colors ${
                      selected
                        ? 'border-ignite bg-ignite/15 shadow-glow-sm'
                        : 'border-surface-3 bg-surface-2 hover-glow'
                    }`}
                  >
                    <input
                      type="radio"
                      name="pref-connection-type"
                      value={ct.value}
                      checked={selected}
                      onChange={() => setConnectionType(ct.value)}
                      className="sr-only"
                    />
                    <span className="flex items-center gap-2">
                      <i
                        className={`bi ${ct.icon} ${selected ? 'text-ignite' : 'text-content-muted'}`}
                        aria-hidden="true"
                      />
                      <span className="text-sm font-medium text-content">{ct.title}</span>
                      {selected && (
                        <i className="bi bi-check-circle-fill ml-auto text-ignite" aria-hidden="true" />
                      )}
                    </span>
                    <span className="mt-1 block text-xs text-content-muted">{ct.description}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="pref-provider" className="mb-1 block text-xs text-content-muted">
                Default provider
              </label>
              <Select
                id="pref-provider"
                aria-label="Default provider"
                value={provider}
                onChange={setProvider}
                options={[
                  { value: AUTO, label: 'Auto (best available)', icon: 'bi-stars' },
                  ...PROVIDER_IDS.map((id) => ({ value: id, label: id })),
                ]}
              />
            </div>

            <div>
              <label htmlFor="pref-tone" className="mb-1 block text-xs text-content-muted">
                Default tone
              </label>
              <Select
                id="pref-tone"
                aria-label="Default tone"
                value={tone}
                onChange={setTone}
                options={TONES.map((t) => ({ value: t, label: titleCase(t) }))}
              />
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
