'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toaster';
import { MarkdownContent } from '@/components/chat/MarkdownContent';
import { formatDateTime } from '@/lib/datetime';
import { summarizeMarkdown } from '@/lib/markdown';
import { ExportMenu } from './ExportMenu';

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
 * Compact overview tile for the saved-content library: badges, a derived
 * title and a short plain-text excerpt. "View" opens a dialog with the full
 * rendered content plus copy / export / delete.
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
  const [open, setOpen] = useState(false);
  const { title, excerpt } = useMemo(() => summarizeMarkdown(item.output), [item.output]);
  const filename = `${item.contentType}-${item.channel}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(item.output);
      toast('Copied to clipboard.', 'success');
    } catch {
      toast('Could not copy — your browser blocked clipboard access.', 'error');
    }
  }

  const badges = (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge tone="brand">{item.contentType}</Badge>
      <Badge tone="neutral">{channelLabel}</Badge>
      <Badge tone="neutral">{item.tone}</Badge>
    </span>
  );

  return (
    <li className="flex min-w-0 flex-col rounded-lg border border-surface-3 bg-surface-2 p-4 transition-colors hover:border-ignite/40">
      {badges}
      <h3 className="mt-3 line-clamp-1 text-sm font-semibold text-content" title={title}>
        {title}
      </h3>
      {excerpt && (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-content-muted">{excerpt}</p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <span className="truncate text-xs text-content-muted">{formatDateTime(item.createdAt)}</span>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            onClick={() => onDelete(item.id)}
            aria-label="Delete saved content"
            className="px-2 py-1.5"
          >
            <i className="bi bi-trash" aria-hidden="true" />
          </Button>
          <Button variant="secondary" onClick={() => setOpen(true)} className="px-3 py-1.5">
            <i className="bi bi-eye" aria-hidden="true" />
            View
          </Button>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        header={
          <div className="flex flex-wrap items-center gap-2">
            {badges}
            <span className="text-xs text-content-muted">{formatDateTime(item.createdAt)}</span>
          </div>
        }
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                onDelete(item.id);
              }}
              className="mr-auto"
            >
              <i className="bi bi-trash" aria-hidden="true" />
              Delete
            </Button>
            <Button variant="secondary" onClick={() => void copy()}>
              <i className="bi bi-clipboard" aria-hidden="true" />
              Copy
            </Button>
            <ExportMenu filename={filename} content={item.output} direction="up" />
          </>
        }
      >
        <MarkdownContent content={item.output} preserveLineBreaks className="text-sm text-content" />
      </Modal>
    </li>
  );
}
