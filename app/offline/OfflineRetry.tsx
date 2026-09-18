'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Watches the browser's connectivity. Rather than making the user guess when to
 * retry, this enables the button the moment the `online` event fires.
 */
export function OfflineRetry() {
  const router = useRouter();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      <span
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
          online ? 'bg-emerald-500/15 text-emerald-400' : 'bg-surface-3 text-content-muted'
        }`}
      >
        <i className={`bi ${online ? 'bi-check-circle-fill' : 'bi-dash-circle'}`} aria-hidden="true" />
        {online ? 'Connection restored' : 'Still offline'}
      </span>
      <button
        type="button"
        onClick={() => router.refresh()}
        disabled={!online}
        className="focus-ignite hover-glow inline-flex items-center gap-2 rounded-md bg-ignite px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ignite-dark disabled:cursor-not-allowed disabled:bg-ignite/40"
      >
        <i className="bi bi-arrow-clockwise" aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}
