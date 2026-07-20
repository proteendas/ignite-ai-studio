'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, getProviders } from 'next-auth/react';
import { PasswordInput } from '@/components/ui/PasswordInput';

type Mode = 'signin' | 'signup';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthProviderIds, setOauthProviderIds] = useState<string[]>([]);

  useEffect(() => {
    getProviders().then((providers) => {
      if (!providers) return;
      setOauthProviderIds(
        Object.values(providers)
          .filter((p) => p.id !== 'credentials')
          .map((p) => p.id)
      );
    });
  }, []);

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Invalid email or password.');
        return;
      }

      router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Could not create account.');
        return;
      }

      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Account created, but sign-in failed. Please try signing in.');
        setMode('signin');
        return;
      }

      router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-base px-4">
      <div className="w-full max-w-md rounded-2xl border border-surface-3 bg-surface-1 p-8 shadow-glow-sm">
        <div className="mb-6 text-center">
          <div className="mb-2 flex items-center justify-center gap-2">
            <i className="bi bi-fire text-3xl text-ignite" aria-hidden="true" />
            <h1 className="text-2xl font-semibold text-content">IgniteAI Studio</h1>
          </div>
          <p className="text-xs text-ignite-light">Spark intelligence from any document.</p>
          <p className="mt-3 text-sm text-content-muted">
            {mode === 'signin'
              ? 'Sign in to continue'
              : 'Create an account to get started'}
          </p>
        </div>

        <form
          onSubmit={mode === 'signin' ? handleSignIn : handleSignUp}
          className="space-y-4"
        >
          {mode === 'signup' && (
            <div>
              <label
                htmlFor="name"
                className="mb-1 block text-sm font-medium text-content-muted"
              >
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="focus-ignite w-full rounded-lg border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-content placeholder:text-content-muted focus:border-ignite focus:outline-none"
                placeholder="Jane Doe"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-content-muted"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="focus-ignite w-full rounded-lg border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-content placeholder:text-content-muted focus:border-ignite focus:outline-none"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-content-muted"
            >
              Password
            </label>
            <PasswordInput
              id="password"
              value={password}
              onChange={setPassword}
              required
              minLength={8}
              placeholder="••••••••"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && (
            <p className="text-sm text-ignite-light">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="focus-ignite hover-glow w-full rounded-lg bg-ignite px-4 py-2 text-sm font-medium text-white transition hover:bg-ignite-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? 'Please wait…'
              : mode === 'signin'
                ? 'Sign in'
                : 'Create account'}
          </button>
        </form>

        <div className="mt-4 text-center text-sm text-content-muted">
          {mode === 'signin' ? (
            <>
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode('signup');
                }}
                className="font-medium text-ignite-light hover:underline"
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode('signin');
                }}
                className="font-medium text-ignite-light hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </div>

        {oauthProviderIds.length > 0 && (
          <>
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-surface-3" />
              <span className="text-xs uppercase text-content-muted">or</span>
              <div className="h-px flex-1 bg-surface-3" />
            </div>

            <div className="space-y-3">
              {oauthProviderIds.includes('google') && (
                <button
                  type="button"
                  onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
                  className="focus-ignite hover-glow w-full rounded-lg border border-surface-3 bg-surface-2 px-4 py-2 text-sm font-medium text-content transition hover:bg-surface-3 gap-2 flex items-center justify-center"
                >
                  <i className="bi bi-google"></i>
                  Continue with Google
                </button>
              )}
              {oauthProviderIds.includes('github') && (
                <button
                  type="button"
                  onClick={() => signIn('github', { callbackUrl: '/dashboard' })}
                  className="focus-ignite hover-glow w-full rounded-lg border border-surface-3 bg-surface-2 px-4 py-2 text-sm font-medium text-content transition hover:bg-surface-3 gap-2 flex items-center justify-center"
                >
                  <i className="bi bi-github"></i>
                  Continue with GitHub
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
