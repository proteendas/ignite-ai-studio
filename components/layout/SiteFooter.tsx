import Link from 'next/link';
import clsx from 'clsx';
import { LEGAL_PAGES, OPERATOR } from '@/components/legal/constants';

/** The subset surfaced inline; the rest are one click away on /legal. */
const PRIMARY = ['/legal/privacy', '/legal/terms', '/legal/cookies', '/legal/acceptable-use', '/legal/security'];

/**
 * Global footer carrying the legal links. Rendered both inside the signed-in
 * shell and on the signed-out pages, because the policies have to be reachable
 * from either side of the login boundary.
 */
export function SiteFooter({ className }: { className?: string }) {
  const primaryLinks = LEGAL_PAGES.filter((p) => PRIMARY.includes(p.href));

  return (
    <footer
      className={clsx(
        'shrink-0 border-t border-surface-3 bg-surface-1 px-4 py-6 md:px-8',
        className
      )}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {primaryLinks.map((page) => (
            <Link
              key={page.href}
              href={page.href}
              className="focus-ignite text-xs text-content-muted transition-colors hover:text-content"
            >
              {page.label}
            </Link>
          ))}
          <Link
            href="/legal"
            className="focus-ignite text-xs font-medium text-ignite-light transition-colors hover:text-ignite"
          >
            All policies
          </Link>
          <Link
            href="/support"
            className="focus-ignite text-xs text-content-muted transition-colors hover:text-content"
          >
            Support
          </Link>
        </nav>

        <p className="text-xs text-content-muted">
          &copy; {new Date().getFullYear()} {OPERATOR.product} · Operated by {OPERATOR.name}
        </p>
      </div>
    </footer>
  );
}
