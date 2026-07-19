'use client';

import { useState } from 'react';
import { Citation } from '@/lib/types';

export function CitationBadge({ citation }: { citation: Citation }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="focus-ignite inline-flex items-center gap-1 rounded bg-ignite/15 px-1.5 py-0.5 text-xs font-medium text-ignite-light transition-colors hover:bg-ignite/25"
      >
        <i className="bi bi-quote" aria-hidden="true" />
        {citation.filename}#{citation.chunkIndex}
      </button>
      {open && (
        <span className="absolute bottom-full left-0 z-10 mb-1 block w-64 rounded-md border border-surface-3 bg-surface-2 p-2 text-xs text-content-muted shadow-glow-sm">
          {citation.snippet}…
        </span>
      )}
    </span>
  );
}
