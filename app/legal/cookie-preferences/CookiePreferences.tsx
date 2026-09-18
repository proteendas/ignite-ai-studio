'use client';

import { useEffect, useState } from 'react';
import { SuccessState } from '@/components/states';

interface Row {
  key: string;
  label: string;
  description: string;
  required: boolean;
  present: boolean;
}

/**
 * Real cookie controls rather than a decorative banner. The app sets only
 * strictly-necessary auth cookies plus one theme preference, so the honest
 * interface is a live inventory of what is actually stored in this browser and
 * a button that clears the optional entry — not a consent toggle for tracking
 * that does not exist.
 */
export function CookiePreferences() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [cleared, setCleared] = useState(false);

  const inspect = () => {
    let themeStored = false;
    try {
      themeStored = localStorage.getItem('igniteai-theme') !== null;
    } catch {
      // Private browsing or blocked site data — treat as not stored.
      themeStored = false;
    }
    const cookies = typeof document !== 'undefined' ? document.cookie : '';
    const hasSession = /next-auth\.session-token|__Secure-next-auth\.session-token/.test(cookies);
    const hasCsrf = /next-auth\.csrf-token/.test(cookies);

    setRows([
      {
        key: 'session',
        label: 'Authentication session',
        description: 'Keeps you signed in. Required — clearing it signs you out.',
        required: true,
        present: hasSession,
      },
      {
        key: 'csrf',
        label: 'CSRF protection token',
        description: 'Protects the sign-in form from cross-site request forgery. Required.',
        required: true,
        present: hasCsrf,
      },
      {
        key: 'theme',
        label: 'Theme preference',
        description: 'Remembers your light or dark choice. Optional — stored only in this browser.',
        required: false,
        present: themeStored,
      },
    ]);
  };

  useEffect(inspect, []);

  const clearOptional = () => {
    try {
      localStorage.removeItem('igniteai-theme');
    } catch {
      // Nothing to clear if storage is unavailable.
    }
    setCleared(true);
    inspect();
  };

  if (!rows) {
    return <p className="text-sm text-content-muted">Checking what this browser has stored…</p>;
  }

  return (
    <div className="not-prose space-y-4">
      <ul className="divide-y divide-surface-3 rounded-lg border border-surface-3">
        {rows.map((row) => (
          <li key={row.key} className="flex items-start justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-content">{row.label}</p>
              <p className="mt-0.5 text-xs text-content-muted">{row.description}</p>
            </div>
            <span
              className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                row.required
                  ? 'bg-surface-3 text-content-muted'
                  : row.present
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-surface-3 text-content-muted'
              }`}
            >
              <i
                className={`bi ${row.required ? 'bi-lock' : row.present ? 'bi-check-lg' : 'bi-dash'}`}
                aria-hidden="true"
              />
              {row.required ? 'Always on' : row.present ? 'Stored' : 'Not stored'}
            </span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={clearOptional}
        className="focus-ignite hover-glow inline-flex items-center gap-2 rounded-md border border-surface-3 bg-surface-2 px-4 py-2 text-sm font-medium text-content transition-colors hover:bg-surface-3"
      >
        <i className="bi bi-trash" aria-hidden="true" />
        Clear optional storage
      </button>

      {cleared && (
        <SuccessState
          title="Optional storage cleared"
          message="Your theme preference was removed from this browser. The app will use the default dark theme on your next visit."
        />
      )}
    </div>
  );
}
