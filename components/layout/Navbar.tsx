'use client';

import { useSession, signOut } from 'next-auth/react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export function Navbar() {
  const { data: session } = useSession();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-surface-3 bg-surface-1 px-6">
      <div className="text-sm text-content-muted">
        {session?.user?.email ? (
          <span>
            <i className="bi bi-person-circle mr-1.5" aria-hidden="true" />
            {session.user.email}
          </span>
        ) : (
          ''
        )}
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/login' })}
          aria-label="Sign out"
          className="focus-ignite inline-flex items-center gap-2 rounded-md border border-surface-3 px-3 py-1.5 text-sm text-content-muted transition-colors hover:text-content hover-glow"
        >
          <i className="bi bi-box-arrow-right" aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </div>
    </header>
  );
}
