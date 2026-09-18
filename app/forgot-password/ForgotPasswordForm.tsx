'use client';

import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { SuccessState } from '@/components/states';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? 'Could not send the reset link. Try again.');
        return;
      }
      // The endpoint answers identically for known and unknown addresses, so
      // the UI must not imply the account exists either.
      setSent(true);
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <SuccessState
        title="Check your inbox"
        message={
          <>
            If an account exists for <span className="text-content">{email}</span>, a reset link is
            on its way. The link expires in one hour and can only be used once.
          </>
        }
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="forgot-email" className="mb-1.5 block text-sm font-medium text-content">
          Email address
        </label>
        <input
          id="forgot-email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="focus-ignite w-full rounded-md border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-content placeholder:text-content-muted"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-ignite-light">
          {error}
        </p>
      )}

      <Button type="submit" variant="primary" className="w-full" disabled={loading}>
        {loading ? <Spinner /> : <i className="bi bi-send" aria-hidden="true" />}
        Send reset link
      </Button>
    </form>
  );
}
