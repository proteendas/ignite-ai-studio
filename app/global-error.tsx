'use client';

import { useEffect } from 'react';

/**
 * Last-resort boundary for errors thrown by the root layout. It must render its
 * own <html>/<body> because the failing layout never mounted, which also means
 * no global CSS is guaranteed — styles here are inline on purpose.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Fatal application error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000',
          color: '#f5f5f5',
          fontFamily: '-apple-system, Segoe UI, Roboto, sans-serif',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <div style={{ color: '#ed1515', fontSize: 32, marginBottom: 12 }}>&#9888;</div>
          <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>IgniteAI Studio failed to start</h1>
          <p style={{ fontSize: 14, lineHeight: '22px', color: '#a3a3a3', margin: '0 0 24px' }}>
            A fatal error stopped the app from rendering. Reloading usually fixes it.
            {error.digest ? ` Reference: ${error.digest}` : ''}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: '#ed1515',
              color: '#fff',
              border: 0,
              borderRadius: 6,
              padding: '10px 18px',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
