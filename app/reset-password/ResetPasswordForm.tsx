'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { SuccessState, ErrorState } from '@/components/states';

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A link with no token never reaches the API — fail here with a route back.
  if (!token) {
    return (
      <ErrorState
        title="This link is incomplete"
        message={
          <>
            The reset link is missing its token, which usually means it was truncated by an email
            client. Request a fresh one from the{' '}
            <Link href="/forgot-password" className="text-ignite-light underline">
              forgot password
            </Link>{' '}
            page.
          </>
        }
      />
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? 'Could not reset your password.');
        return;
      }
      setDone(true);
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <SuccessState
        title="Password updated"
        message="You can now sign in with your new password."
        action={
          <Link
            href="/login"
            className="focus-ignite hover-glow inline-flex items-center gap-2 rounded-md bg-ignite px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ignite-dark"
          >
            <i className="bi bi-box-arrow-in-right" aria-hidden="true" />
            Sign in
          </Link>
        }
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-content">
          New password
        </label>
        <PasswordInput
          id="new-password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      <div>
        <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-content">
          Confirm new password
        </label>
        <PasswordInput
          id="confirm-password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          required
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-ignite-light">
          {error}
        </p>
      )}

      <Button type="submit" variant="primary" className="w-full" disabled={loading}>
        {loading ? <Spinner /> : <i className="bi bi-check-lg" aria-hidden="true" />}
        Update password
      </Button>
    </form>
  );
}
