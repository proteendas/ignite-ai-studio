'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LEGAL_PAGES } from './constants';

/**
 * Cross-links to the other policies, shown at the foot of each policy page.
 *
 * Split out of LegalPage purely so that component can stay a server component:
 * every policy page exports `metadata`, which a client module cannot provide.
 * Only this nav needs the current path, so only this nav runs on the client.
 */
export function OtherPolicies() {
  const pathname = usePathname();
  // The heading says "Other policies", so the page being read is dropped rather
  // than rendered as a link back to itself.
  const others = LEGAL_PAGES.filter((page) => page.href !== pathname);

  return (
    <div className="flex flex-wrap gap-2">
      {others.map((page) => (
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
  );
}
