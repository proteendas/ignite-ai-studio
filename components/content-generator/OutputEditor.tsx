'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toaster';
import { exportAsTxt, exportAsMarkdown, exportAsDocx } from '@/lib/export';
import { ContentType, Tone, Channel } from '@/lib/types';

export interface OutputMeta {
  documentId: string;
  contentType: ContentType;
  tone: Tone;
  channel: Channel;
}

type ExportFormat = 'txt' | 'md' | 'docx';

const EXPORT_FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'txt', label: 'Plain text (.txt)' },
  { value: 'md', label: 'Markdown (.md)' },
  { value: 'docx', label: 'Word (.docx)' },
];

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
  const [exportOpen, setExportOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [exportOpen]);

  const filenameBase = `${meta.contentType}-${meta.channel}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      toast('Copied to clipboard.', 'success');
    } catch {
      toast('Could not copy to clipboard.', 'error');
    }
  };

  const handleExport = async (fmt: ExportFormat) => {
    setExportOpen(false);
    try {
      if (fmt === 'txt') exportAsTxt(filenameBase, content);
      else if (fmt === 'md') exportAsMarkdown(filenameBase, content);
      else await exportAsDocx(filenameBase, content);
      toast(`Exported as .${fmt}.`, 'success');
    } catch {
      toast('Export failed.', 'error');
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

          <div className="relative" ref={menuRef}>
            <Button
              variant="secondary"
              onClick={() => setExportOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
            >
              <i className="bi bi-download" aria-hidden="true" />
              Export
              <i className="bi bi-chevron-down text-xs" aria-hidden="true" />
            </Button>
            {exportOpen && (
              <div
                role="menu"
                className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-md border border-surface-3 bg-surface-2 py-1 shadow-glow-sm"
              >
                {EXPORT_FORMATS.map((fmt) => (
                  <button
                    key={fmt.value}
                    type="button"
                    role="menuitem"
                    onClick={() => handleExport(fmt.value)}
                    className="focus-ignite flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-content transition-colors hover:bg-surface-3"
                  >
                    <i className="bi bi-file-earmark-text text-content-muted" aria-hidden="true" />
                    {fmt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

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

      <textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        rows={16}
        aria-label={`Generated ${meta.contentType} for ${meta.channel}`}
        className="focus-ignite w-full rounded-md border border-surface-3 bg-surface-2 p-3 text-sm leading-relaxed text-content transition-colors hover:border-ignite/40"
      />
    </div>
  );
}
