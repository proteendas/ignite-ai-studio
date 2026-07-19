'use client';

import { DocumentRecord } from '@/lib/types';

export function DocumentPicker({
  documents,
  value,
  onChange,
}: {
  documents: DocumentRecord[];
  value: string;
  onChange: (id: string) => void;
}) {
  const readyDocs = documents.filter((d) => d.status === 'ready');

  return (
    <div>
      <label htmlFor="content-gen-document" className="mb-1.5 block text-sm font-medium text-content">
        <i className="bi bi-file-earmark-text mr-1.5 text-content-muted" aria-hidden="true" />
        Source document
      </label>
      <select
        id="content-gen-document"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={readyDocs.length === 0}
        className="focus-ignite w-full rounded-md border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-content transition-colors hover:border-ignite/50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="">Select a document…</option>
        {readyDocs.map((doc) => (
          <option key={doc.id} value={doc.id}>
            {doc.filename}
          </option>
        ))}
      </select>
      {readyDocs.length === 0 && (
        <p className="mt-1.5 text-xs text-content-muted">
          No ready documents yet — upload one on the Documents page first.
        </p>
      )}
    </div>
  );
}
