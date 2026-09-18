'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { StatusPage } from '@/components/states';

/**
 * Route-level error boundary (Next.js App Router). Catches render and data
 * errors inside the app shell; app/global-error.tsx covers failures in the root
 * layout itself, which this boundary cannot reach.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled application error:', error);
  }, [error]);

  return (
    <StatusPage
      code="500"
      icon="bi-exclamation-octagon"
      title="Something went wrong on our end"
      description={
        <>
          The page failed to load. Trying again often clears it — if it keeps happening, send us
          the reference below.
          {error.digest && (
            <span className="mt-3 block font-mono text-xs text-content-muted">
              Reference: {error.digest}
            </span>
          )}
        </>
      }
    >
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="focus-ignite hover-glow inline-flex items-center gap-2 rounded-md bg-ignite px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ignite-dark"
        >
          <i className="bi bi-arrow-clockwise" aria-hidden="true" />
          Try again
        </button>
        <Link
          href="/support"
          className="focus-ignite hover-glow inline-flex items-center gap-2 rounded-md border border-surface-3 bg-surface-2 px-4 py-2 text-sm font-medium text-content transition-colors hover:bg-surface-3"
        >
          <i className="bi bi-life-preserver" aria-hidden="true" />
          Contact support
        </Link>
      </div>
    </StatusPage>
  );
}
