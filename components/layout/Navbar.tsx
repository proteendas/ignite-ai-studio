'use client';

import { useSession, signOut } from 'next-auth/react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

interface NavbarProps {
  onMenuClick: () => void;
}

export function Navbar({ onMenuClick }: NavbarProps) {
  const { data: session } = useSession();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-surface-3 bg-surface-1 px-3 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation"
          className="focus-ignite -ml-1 rounded-md p-2 text-content-muted hover:text-content md:hidden"
        >
          <i className="bi bi-list text-lg" aria-hidden="true" />
        </button>
        <div className="min-w-0 truncate text-sm text-content-muted">
          {session?.user?.email ? (
            <span>
              <i className="bi bi-person-circle mr-1.5" aria-hidden="true" />
              {session.user.email}
            </span>
          ) : (
            ''
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ThemeToggle />
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/login' })}
          aria-label="Sign out"
          className="focus-ignite inline-flex items-center gap-2 rounded-md border border-surface-3 px-3 py-1.5 text-sm text-content-muted transition-colors hover:text-content hover-glow"
        >
          <i className="bi bi-box-arrow-right" aria-hidden="true" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
