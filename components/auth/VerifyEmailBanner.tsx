'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

const DISMISS_KEY = 'igniteai-verify-banner-dismissed';

/**
 * Prompts credentials users to confirm their address. Dismissal is remembered
 * per browser rather than server-side: this is a nudge, not a gate, and nothing
 * in the app is withheld until the address is verified.
 */
export function VerifyEmailBanner() {
  const { status } = useSession();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') return;

    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(DISMISS_KEY) === 'true';
    } catch {
      dismissed = false;
    }
    if (dismissed) return;

    let cancelled = false;
    fetch('/api/auth/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { emailVerified?: boolean; provider?: string } | null) => {
        if (cancelled || !json) return;
        // OAuth accounts are verified by their identity provider already.
        if (json.provider === 'oauth') return;
        setShow(json.emailVerified === false);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [status]);

  if (!show) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, 'true');
    } catch {
      // Non-fatal: the banner simply reappears next load.
    }
    setShow(false);
  };

  return (
    <div
      role="status"
      className="flex items-start gap-3 border-b border-ignite/30 bg-ignite/10 px-4 py-2.5 text-sm md:px-6"
    >
      <i className="bi bi-envelope-exclamation mt-0.5 shrink-0 text-ignite" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-content-muted">
        Your email address isn&rsquo;t verified yet.{' '}
        <Link href="/verify-email" className="focus-ignite font-medium text-ignite-light hover:underline">
          Send a verification link
        </Link>{' '}
        so you can recover your account if you forget your password.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss verification reminder"
        className="focus-ignite shrink-0 rounded-md p-1 text-content-muted transition-colors hover:text-content"
      >
        <i className="bi bi-x-lg" aria-hidden="true" />
      </button>
    </div>
  );
}
