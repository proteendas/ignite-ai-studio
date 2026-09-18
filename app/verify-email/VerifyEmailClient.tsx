'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { SuccessState, ErrorState, LoadingState } from '@/components/states';

type Phase = 'idle' | 'verifying' | 'verified' | 'failed';

/**
 * Two jobs on one route: redeem a token when the user arrives from an email
 * link, and otherwise offer to (re)send the link. Splitting these into separate
 * routes would mean the email link and the "resend" affordance live in
 * different places, which is more to explain and easier to get wrong.
 */
export function VerifyEmailClient({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>(token ? 'verifying' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const verify = useCallback(async (value: string) => {
    setPhase('verifying');
    setError(null);
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: value }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? 'This verification link is not valid.');
        setPhase('failed');
        return;
      }
      setPhase('verified');
    } catch {
      setError('Network error. Check your connection and try again.');
      setPhase('failed');
    }
  }, []);

  useEffect(() => {
    if (token) void verify(token);
  }, [token, verify]);

  async function resend() {
    setResending(true);
    setNotice(null);
    try {
      const res = await fetch('/api/auth/resend-verification', { method: 'POST' });
      const json = (await res.json()) as { error?: string; message?: string };
      setNotice(
        res.ok
          ? (json.message ?? 'Verification email sent.')
          : (json.error ?? 'Could not send the verification email.')
      );
    } catch {
      setNotice('Network error. Try again shortly.');
    } finally {
      setResending(false);
    }
  }

  if (phase === 'verifying') {
    return <LoadingState label="Confirming your email address…" className="border-0 bg-transparent py-6" />;
  }

  if (phase === 'verified') {
    return (
      <SuccessState
        title="Email verified"
        message="Your address is confirmed. You're all set."
        action={
          <Link
            href="/dashboard"
            className="focus-ignite hover-glow inline-flex items-center gap-2 rounded-md bg-ignite px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ignite-dark"
          >
            <i className="bi bi-speedometer2" aria-hidden="true" />
            Go to dashboard
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {phase === 'failed' && (
        <ErrorState
          title="We couldn't verify that link"
          message={error ?? 'The link may have expired or already been used.'}
        />
      )}

      <p className="text-sm text-content-muted">
        {phase === 'failed'
          ? 'Send yourself a fresh link — the new one replaces any older link.'
          : 'Send a verification link to the address on your account. It expires in 24 hours and can be used once.'}
      </p>

      <Button
        type="button"
        variant="primary"
        className="w-full"
        onClick={() => void resend()}
        disabled={resending}
      >
        {resending ? <Spinner /> : <i className="bi bi-send" aria-hidden="true" />}
        {phase === 'failed' ? 'Send a new link' : 'Send verification link'}
      </Button>

      {notice && (
        <p role="status" className="text-center text-sm text-content-muted">
          {notice}
        </p>
      )}

      <p className="text-center text-xs text-content-muted">
        You need to be signed in for us to know where to send it.
      </p>
    </div>
  );
}
