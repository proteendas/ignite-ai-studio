'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: 'bi-speedometer2' },
  { href: '/chat', label: 'Chat', icon: 'bi-chat-dots' },
  { href: '/documents', label: 'Documents', icon: 'bi-file-earmark-text' },
  { href: '/content-generator', label: 'Content Generator', icon: 'bi-megaphone' },
  { href: '/observability', label: 'Observability', icon: 'bi-graph-up' },
  { href: '/settings', label: 'Settings', icon: 'bi-gear' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-surface-3 bg-surface-1 p-4">
      <div className="mb-8 flex items-center gap-2 px-2">
        <i className="bi bi-fire text-2xl text-ignite" aria-hidden="true" />
        <div>
          <div className="text-base font-semibold leading-tight text-content">IgniteAI Studio</div>
          <div className="text-[10px] leading-tight text-content-muted">
            Spark intelligence from any document
          </div>
        </div>
      </div>
      <nav className="flex flex-col gap-1" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={clsx(
                'focus-ignite flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-ignite/15 text-ignite-light shadow-glow-sm'
                  : 'text-content-muted hover:bg-surface-2 hover:text-content'
              )}
            >
              <i className={`bi ${item.icon}`} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
