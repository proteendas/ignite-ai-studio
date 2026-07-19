'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ProtectedShell } from '@/components/layout/ProtectedShell';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { UploadDropzone } from '@/components/documents/UploadDropzone';
import { DocumentList } from '@/components/documents/DocumentList';
import { DocumentRecord } from '@/lib/types';

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const firstLoad = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/documents');
      if (res.ok) {
        const data = (await res.json()) as { documents: DocumentRecord[] };
        setDocuments(data.documents ?? []);
      }
    } finally {
      if (firstLoad.current) {
        firstLoad.current = false;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    refresh();
    // Poll so "processing" documents flip to "ready" without a manual refresh.
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleDelete = useCallback(
    async (id: string) => {
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      refresh();
    },
    [refresh]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((d) => d.filename.toLowerCase().includes(q));
  }, [documents, query]);

  return (
    <ProtectedShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-content">Document Library</h1>
          <p className="mt-1 text-sm text-content-muted">
            Upload PDF, DOCX, TXT, or MD files to ground chat answers and content generation in your
            own facts.
          </p>
        </div>

        <Card>
          <UploadDropzone onUploaded={refresh} />
        </Card>

        <Card className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold text-content">Your documents</h2>
            <div className="relative w-full sm:w-64">
              <i
                className="bi bi-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-content-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by filename…"
                aria-label="Search documents by filename"
                className="focus-ignite w-full rounded-md border border-surface-3 bg-surface-2 py-2 pl-9 pr-3 text-sm text-content placeholder:text-content-muted"
              />
            </div>
          </div>

          {loading ? (
            <div className="space-y-3" aria-label="Loading documents" aria-busy="true">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <i className="bi bi-file-earmark-text text-4xl text-content-muted" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-content">No documents yet</p>
              <p className="mt-1 text-xs text-content-muted">
                Upload a file above to start grounding your AI in your own knowledge.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-content-muted">
              No documents match &ldquo;{query}&rdquo;.
            </p>
          ) : (
            <DocumentList documents={filtered} onDelete={handleDelete} />
          )}
        </Card>
      </div>
    </ProtectedShell>
  );
}
