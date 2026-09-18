'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toaster';
import { exportAsTxt, exportAsMarkdown, exportAsDocx } from '@/lib/export';
import { formatDateTime } from '@/lib/datetime';

export interface SavedItem {
  id: string;
  documentId: string | null;
  contentType: string;
  tone: string;
  channel: string;
  output: string;
  createdAt: string;
}

/**
 * A row in the saved-content library.
 *
 * Previously this showed two truncated lines with only a Delete button, so
 * saved content could be seen but never read back in full — the one thing the
 * library exists for. The row now expands in place, and carries the same copy
 * and export actions as a freshly generated output.
 */
export function SavedContentItem({
  item,
  channelLabel,
  onDelete,
}: {
  item: SavedItem;
  channelLabel: string;
  onDelete: (id: string) => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  const filename = `${item.contentType}-${item.channel}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(item.output);
      toast('Copied to clipboard.', 'success');
    } catch {
      toast('Could not copy — your browser blocked clipboard access.', 'error');
    }
  }

  async function download(kind: 'txt' | 'md' | 'docx') {
    setBusy(true);
    try {
      if (kind === 'txt') exportAsTxt(filename, item.output);
      else if (kind === 'md') exportAsMarkdown(filename, item.output);
      else await exportAsDocx(filename, item.output);
    } catch {
      toast('Export failed.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="focus-ignite min-w-0 flex-1 rounded-md text-left"
        >
          <span className="mb-1 flex flex-wrap items-center gap-1.5">
            <Badge tone="brand">{item.contentType}</Badge>
            <Badge tone="neutral">{channelLabel}</Badge>
            <Badge tone="neutral">{item.tone}</Badge>
          </span>
          <span
            className={`block whitespace-pre-wrap break-words text-sm text-content-muted ${
              expanded ? '' : 'line-clamp-2'
            }`}
          >
            {item.output}
          </span>
          <span className="mt-1 flex items-center gap-1.5 text-xs text-content-muted">
            <i
              className={`bi ${expanded ? 'bi-chevron-up' : 'bi-chevron-down'}`}
              aria-hidden="true"
            />
            {expanded ? 'Show less' : 'Show full content'}
            <span aria-hidden="true">·</span>
            {formatDateTime(item.createdAt)}
          </span>
        </button>

        <Button
          variant="danger"
          onClick={() => onDelete(item.id)}
          aria-label="Delete saved content"
          className="shrink-0"
        >
          <i className="bi bi-trash" aria-hidden="true" />
        </Button>
      </div>

      {expanded && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-surface-3 pt-3">
          <Button variant="secondary" onClick={() => void copy()}>
            <i className="bi bi-clipboard" aria-hidden="true" />
            Copy
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => void download('txt')}>
            <i className="bi bi-filetype-txt" aria-hidden="true" />
            .txt
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => void download('md')}>
            <i className="bi bi-filetype-md" aria-hidden="true" />
            .md
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => void download('docx')}>
            <i className="bi bi-filetype-docx" aria-hidden="true" />
            .docx
          </Button>
        </div>
      )}
    </li>
  );
}
