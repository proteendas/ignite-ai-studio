'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toaster';
import { MarkdownContent } from '@/components/chat/MarkdownContent';
import { ExportMenu } from './ExportMenu';
import { ContentType, Tone, Channel } from '@/lib/types';

export interface OutputMeta {
  documentId: string;
  contentType: ContentType;
  tone: Tone;
  channel: Channel;
}

export function OutputEditor({
  content,
  provider,
  meta,
  onChange,
  onRegenerate,
  onSaved,
  isRegenerating = false,
}: {
  content: string;
  provider?: string;
  meta: OutputMeta;
  onChange: (value: string) => void;
  onRegenerate: () => void;
  onSaved?: () => void;
  isRegenerating?: boolean;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<'preview' | 'edit'>('preview');

  const filenameBase = `${meta.contentType}-${meta.channel}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      toast('Copied to clipboard.', 'success');
    } catch {
      toast('Could not copy to clipboard.', 'error');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/content-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: meta.documentId,
          contentType: meta.contentType,
          tone: meta.tone,
          channel: meta.channel,
          output: content,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast(data.error || 'Could not save to library.', 'error');
        return;
      }
      toast('Saved to library.', 'success');
      onSaved?.();
    } catch {
      toast('Network error while saving.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {provider && (
            <Badge tone="brand">
              <i className="bi bi-cpu" aria-hidden="true" />
              via {provider}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={handleCopy}>
            <i className="bi bi-clipboard" aria-hidden="true" />
            Copy
          </Button>

          <ExportMenu filename={filenameBase} content={content} />

          <Button variant="secondary" onClick={handleSave} disabled={saving}>
            {saving ? <Spinner /> : <i className="bi bi-save" aria-hidden="true" />}
            Save
          </Button>

          <Button
            variant="secondary"
            onClick={onRegenerate}
            disabled={isRegenerating}
            aria-label="Regenerate a variation"
          >
            <i
              className={clsx('bi bi-arrow-repeat', isRegenerating && 'animate-spin-slow')}
              aria-hidden="true"
            />
            Regenerate
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-surface-3 bg-surface-2">
        <div
          role="tablist"
          aria-label="Output view"
          className="flex items-center gap-1 border-b border-surface-3 px-2 py-1.5"
        >
          {(
            [
              { value: 'preview', label: 'Preview', icon: 'bi-eye' },
              { value: 'edit', label: 'Edit', icon: 'bi-pencil-square' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={view === tab.value}
              onClick={() => setView(tab.value)}
              className={clsx(
                'focus-ignite inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                view === tab.value
                  ? 'bg-surface-3 text-content'
                  : 'text-content-muted hover:text-content'
              )}
            >
              <i className={`bi ${tab.icon}`} aria-hidden="true" />
              {tab.label}
            </button>
          ))}
          {view === 'edit' && (
            <span className="ml-auto hidden text-xs text-content-muted sm:inline">
              Markdown supported
            </span>
          )}
        </div>

        {view === 'preview' ? (
          <div
            className="max-h-[32rem] min-h-[12rem] cursor-text overflow-y-auto p-4 text-sm text-content"
            onDoubleClick={() => setView('edit')}
            title="Double-click to edit"
          >
            <MarkdownContent content={content} preserveLineBreaks />
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => onChange(e.target.value)}
            rows={16}
            autoFocus
            aria-label={`Generated ${meta.contentType} for ${meta.channel}`}
            className="focus-ignite block w-full resize-y border-0 bg-transparent p-4 font-mono text-[13px] leading-relaxed text-content"
          />
        )}
      </div>
    </div>
  );
}
