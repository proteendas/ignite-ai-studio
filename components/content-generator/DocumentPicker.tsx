'use client';

import { Select } from '@/components/ui/Select';
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
      <Select
        id="content-gen-document"
        aria-label="Source document"
        value={value}
        onChange={onChange}
        disabled={readyDocs.length === 0}
        placeholder="Select a document…"
        options={readyDocs.map((doc) => ({
          value: doc.id,
          label: doc.filename,
          icon: 'bi-file-earmark-text',
        }))}
      />
      {readyDocs.length === 0 && (
        <p className="mt-1.5 text-xs text-content-muted">
          No ready documents yet — upload one on the Documents page first.
        </p>
      )}
    </div>
  );
}
