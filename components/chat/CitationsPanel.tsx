'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Citation } from '@/lib/types';

/**
 * Collapsible detailed source list for a grounded answer: filename, chunk
 * index, similarity score, and snippet per citation. The inline
 * CitationBadge stays the compact view; this is the expanded one.
 */
export function CitationsPanel({ citations }: { citations: Citation[] }) {
  const [open, setOpen] = useState(false);

  if (citations.length === 0) return null;

  return (
    <div className="mt-2 rounded-md border border-surface-3 bg-surface-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="focus-ignite flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-content-muted transition-colors hover:text-content"
      >
        <i
          className={clsx('bi', open ? 'bi-chevron-down' : 'bi-chevron-right')}
          aria-hidden="true"
        />
        <i className="bi bi-journal-text" aria-hidden="true" />
        Sources ({citations.length})
      </button>

      {open && (
        <ul className="space-y-2 border-t border-surface-3 px-2.5 py-2">
          {citations.map((c, i) => (
            <li key={`${c.documentId}-${c.chunkIndex}-${i}`} className="text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 font-medium text-ignite-light">
                  <i className="bi bi-file-earmark-text" aria-hidden="true" />
                  {c.filename}
                </span>
                <span className="text-content-muted">chunk {c.chunkIndex}</span>
                {typeof c.score === 'number' && (
                  <span className="rounded bg-ignite/15 px-1.5 py-0.5 font-medium text-ignite-light">
                    {Math.round(c.score * 100)}% match
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-content-muted">{c.snippet}…</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
