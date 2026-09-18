import Link from 'next/link';
import { LEGAL_PAGES, LAST_UPDATED, OPERATOR } from './constants';

export { OPERATOR, LAST_UPDATED, LEGAL_PAGES, legalMetadata } from './constants';

/**
 * Chrome shared by every policy page: title block, last-updated stamp, prose
 * styling and a cross-link index. Every legal route is publicly reachable —
 * signed out as well as signed in — so these must not depend on a session.
 */
export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <article>
      <header className="mb-8 border-b border-surface-3 pb-6">
        <h1 className="text-2xl font-semibold text-content">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-content-muted">{intro}</p>
        <p className="mt-4 text-xs text-content-muted">
          Last updated {LAST_UPDATED} · Operated by {OPERATOR.name} (
          <a
            href={`mailto:${OPERATOR.email}`}
            className="focus-ignite text-ignite-light underline underline-offset-2"
          >
            {OPERATOR.email}
          </a>
          )
        </p>
      </header>

      <div className="legal-prose">{children}</div>

      <footer className="mt-12 border-t border-surface-3 pt-6">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-content-muted">
          Other policies
        </p>
        <div className="flex flex-wrap gap-2">
          {LEGAL_PAGES.map((page) => (
            <Link
              key={page.href}
              href={page.href}
              className="focus-ignite inline-flex items-center gap-1.5 rounded-full border border-surface-3 bg-surface-2 px-3 py-1 text-xs text-content-muted transition-colors hover:border-ignite/50 hover:text-content"
            >
              <i className={`bi ${page.icon}`} aria-hidden="true" />
              {page.label}
            </Link>
          ))}
        </div>
      </footer>
    </article>
  );
}
