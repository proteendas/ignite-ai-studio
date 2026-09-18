'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

/**
 * Chrome for pages that must work on both sides of the login boundary — the
 * policies, the help centre and support. They cannot use ProtectedShell, which
 * assumes a session and renders the app sidebar, so they share this instead.
 */
export function PublicShell({
  children,
  width = 'narrow',
}: {
  children: React.ReactNode;
  width?: 'narrow' | 'wide';
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <div className="flex min-h-screen flex-col bg-base">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-surface-3 bg-surface-1/95 px-4 backdrop-blur md:px-8">
        <Link
          href="/"
          className="focus-ignite flex items-center gap-2 text-sm font-semibold text-content"
        >
          <i className="bi bi-fire text-lg text-ignite" aria-hidden="true" />
          IgniteAI Studio
        </Link>
        <nav className="flex items-center gap-1">
          {[
            { href: '/help', label: 'Help' },
            { href: '/legal', label: 'Legal' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={clsx(
                'focus-ignite hidden rounded-md px-3 py-1.5 text-sm transition-colors sm:inline-flex',
                isActive(item.href)
                  ? 'font-medium text-ignite-light'
                  : 'text-content-muted hover:text-content'
              )}
            >
              {item.label}
            </Link>
          ))}
          <ThemeToggle />
        </nav>
      </header>

      <main
        className={`mx-auto w-full flex-1 px-4 py-10 md:px-8 md:py-14 ${
          width === 'wide' ? 'max-w-5xl' : 'max-w-3xl'
        }`}
      >
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}
