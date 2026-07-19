'use client';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toaster';
import { DocumentRecord } from '@/lib/types';

/** Picks a Bootstrap Icon based on the document's MIME type (falls back to a generic doc). */
function iconForMime(mimeType: string): string {
  if (mimeType.includes('pdf')) return 'bi-file-earmark-pdf';
  if (mimeType.includes('word') || mimeType.includes('officedocument')) return 'bi-file-earmark-word';
  return 'bi-file-earmark-text';
}

const STATUS_TONE: Record<DocumentRecord['status'], 'success' | 'warning' | 'danger'> = {
  ready: 'success',
  processing: 'warning',
  failed: 'danger',
};

const STATUS_ICON: Record<DocumentRecord['status'], string> = {
  ready: 'bi-check-circle-fill',
  processing: 'bi-hourglass-split',
  failed: 'bi-x-circle-fill',
};

function embeddingSummary(doc: DocumentRecord): string {
  switch (doc.status) {
    case 'ready':
      return `${doc.chunkCount} chunks embedded`;
    case 'processing':
      return 'Embedding in progress…';
    case 'failed':
      return 'Not embedded';
  }
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function DocumentList({
  documents,
  onDelete,
}: {
  documents: DocumentRecord[];
  onDelete: (id: string) => void;
}) {
  const { toast } = useToast();

  const handleDelete = (doc: DocumentRecord) => {
    const confirmed = window.confirm(`Delete "${doc.filename}"? This also removes its embeddings.`);
    if (!confirmed) return;
    onDelete(doc.id);
    toast(`"${doc.filename}" deleted`, 'success');
  };

  if (documents.length === 0) {
    return (
      <p className="text-sm text-content-muted">
        No documents uploaded yet. Upload one above to get started.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-surface-3">
      {documents.map((doc) => (
        <li
          key={doc.id}
          className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-start gap-3">
            <i
              className={`bi ${iconForMime(doc.mimeType)} mt-0.5 text-lg text-ignite-light`}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-content">{doc.filename}</p>
              <p className="text-xs text-content-muted">
                {embeddingSummary(doc)} &middot; {formatSize(doc.sizeBytes)} &middot;{' '}
                {new Date(doc.createdAt).toLocaleString()}
              </p>
              {doc.status === 'failed' && doc.error && (
                <p className="mt-1 text-xs text-ignite-light">{doc.error}</p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3 self-end sm:self-auto">
            <Badge tone={STATUS_TONE[doc.status]}>
              <i className={`bi ${STATUS_ICON[doc.status]}`} aria-hidden="true" />
              {doc.status}
            </Badge>
            <Button
              variant="ghost"
              aria-label={`Delete ${doc.filename}`}
              onClick={() => handleDelete(doc)}
              className="px-2 text-ignite-light hover:text-ignite"
            >
              <i className="bi bi-trash" aria-hidden="true" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
