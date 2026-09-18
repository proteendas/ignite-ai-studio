import Link from 'next/link';
import { LEGAL_PAGES, LAST_UPDATED, OPERATOR, legalMetadata } from '@/components/legal/LegalPage';

export const metadata = legalMetadata(
  'Legal',
  'Policies covering privacy, security, acceptable use and data handling for IgniteAI Studio.'
);

export default function LegalIndexPage() {
  return (
    <div>
      <header className="mb-8 border-b border-surface-3 pb-6">
        <h1 className="text-2xl font-semibold text-content">Legal &amp; policies</h1>
        <p className="mt-2 text-sm leading-relaxed text-content-muted">
          Everything governing how {OPERATOR.product} handles your account, your documents and the
          AI output it produces. All of it applies whether you are signed in or not.
        </p>
        <p className="mt-4 text-xs text-content-muted">Last updated {LAST_UPDATED}</p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2">
        {LEGAL_PAGES.map((page) => (
          <li key={page.href}>
            <Link
              href={page.href}
              className="focus-ignite hover-glow flex h-full items-start gap-3 rounded-lg border border-surface-3 bg-surface-1 p-4 transition-colors hover:border-ignite/50"
            >
              <i className={`bi ${page.icon} mt-0.5 text-ignite`} aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-content">{page.label}</span>
                <span className="mt-0.5 block text-xs text-content-muted">{page.summary}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
