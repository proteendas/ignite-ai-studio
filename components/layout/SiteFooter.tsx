'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { LEGAL_PAGES, OPERATOR } from '@/components/legal/constants';

/** The subset surfaced inline; the rest are one click away on /legal. */
const PRIMARY = [
  '/legal/privacy',
  '/legal/terms',
  '/legal/cookies',
  '/legal/acceptable-use',
  '/legal/security',
];

/**
 * Legal footer for contexts with no sidebar: signed-out pages (login, password
 * reset, verification) and the standalone policy / help / support shell.
 *
 * It is deliberately NOT rendered inside the authenticated app — signed-in
 * users reach the same destinations from the sidebar's secondary nav, so a
 * second copy at the bottom of every scroll container is redundant.
 */
export function SiteFooter({ className }: { className?: string }) {
  const pathname = usePathname();
  const primaryLinks = LEGAL_PAGES.filter((p) => PRIMARY.includes(p.href));

  const links: { href: string; label: string; exact?: boolean }[] = [
    ...primaryLinks.map((p) => ({ href: p.href, label: p.label })),
    // Only current on the index itself; a child policy highlights its own link.
    { href: '/legal', label: 'All policies', exact: true },
    { href: '/support', label: 'Support' },
  ];

  return (
    <footer
      className={clsx(
        'shrink-0 border-t border-surface-3 bg-surface-1 px-4 py-6 md:px-8',
        className
      )}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {links.map((link) => {
            const active = link.exact
              ? pathname === link.href
              : pathname === link.href || pathname?.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'focus-ignite text-xs transition-colors',
                  active
                    ? 'font-medium text-ignite-light'
                    : 'text-content-muted hover:text-content'
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <p className="text-xs text-content-muted">
          &copy; {new Date().getFullYear()} {OPERATOR.product} · Operated by {OPERATOR.name}
        </p>
      </div>
    </footer>
  );
}
