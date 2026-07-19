'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { OutputEditor } from './OutputEditor';
import { ContentType, Tone, Channel } from '@/lib/types';

export interface BatchResult {
  channel: Channel;
  output: string;
}

const CHANNEL_META: Record<Channel, { label: string; icon: string }> = {
  linkedin: { label: 'LinkedIn', icon: 'bi-linkedin' },
  x: { label: 'X', icon: 'bi-twitter-x' },
  email: { label: 'Email', icon: 'bi-envelope' },
  'landing-page': { label: 'Landing Page', icon: 'bi-globe' },
  blog: { label: 'Blog', icon: 'bi-journal-text' },
  'ad-copy': { label: 'Ad Placement', icon: 'bi-badge-ad' },
  general: { label: 'General', icon: 'bi-card-text' },
};

export function BatchOutputs({
  results,
  provider,
  documentId,
  contentType,
  tone,
  onOutputChange,
  onRegenerate,
  onSaved,
  regeneratingChannel,
}: {
  results: BatchResult[];
  provider?: string;
  documentId: string;
  contentType: ContentType;
  tone: Tone;
  onOutputChange: (channel: Channel, value: string) => void;
  onRegenerate: (channel: Channel) => void;
  onSaved?: () => void;
  regeneratingChannel?: Channel | null;
}) {
  const [selected, setSelected] = useState<Channel | null>(null);

  if (results.length === 0) return null;

  // Keep the active tab valid even when `results` changes between generations.
  const activeChannel =
    selected && results.some((r) => r.channel === selected) ? selected : results[0].channel;
  const activeResult = results.find((r) => r.channel === activeChannel) ?? results[0];

  return (
    <div className="space-y-4">
      {results.length > 1 && (
        <div role="tablist" aria-label="Generated channels" className="flex flex-wrap gap-1 border-b border-surface-3">
          {results.map((r) => {
            const isActive = r.channel === activeChannel;
            return (
              <button
                key={r.channel}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setSelected(r.channel)}
                className={clsx(
                  'focus-ignite -mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-ignite text-ignite-light'
                    : 'border-transparent text-content-muted hover:text-content'
                )}
              >
                <i className={`bi ${CHANNEL_META[r.channel].icon}`} aria-hidden="true" />
                {CHANNEL_META[r.channel].label}
                {regeneratingChannel === r.channel && (
                  <i className="bi bi-arrow-repeat animate-spin-slow" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      )}

      <OutputEditor
        key={activeResult.channel}
        content={activeResult.output}
        provider={provider}
        meta={{ documentId, contentType, tone, channel: activeResult.channel }}
        onChange={(value) => onOutputChange(activeResult.channel, value)}
        onRegenerate={() => onRegenerate(activeResult.channel)}
        onSaved={onSaved}
        isRegenerating={regeneratingChannel === activeResult.channel}
      />
    </div>
  );
}
