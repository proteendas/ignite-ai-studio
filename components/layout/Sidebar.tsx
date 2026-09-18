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

/** Pinned to the bottom of the sidebar, below a divider, away from the app's own sections. */
const SECONDARY_ITEMS = [
  { href: '/help', label: 'Help centre', icon: 'bi-life-preserver' },
  { href: '/support', label: 'Support', icon: 'bi-envelope' },
  { href: '/legal', label: 'Legal', icon: 'bi-file-earmark-text' },
];

interface SidebarProps {
  /** Whether the mobile off-canvas drawer is open. Ignored at md+ (always visible there). */
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Backdrop: mobile-only, closes the drawer on tap. */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex w-64 max-w-[80%] shrink-0 flex-col border-r border-surface-3 bg-surface-1 p-4 transition-transform duration-200 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full',
          'md:static md:z-auto md:w-60 md:max-w-none md:translate-x-0'
        )}
      >
        <div className="mb-8 flex items-center gap-2 px-2">
          <i className="bi bi-fire text-2xl text-ignite" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold leading-tight text-content">IgniteAI Studio</div>
            <div className="text-[10px] leading-tight text-content-muted">
              Spark intelligence from any document
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="focus-ignite rounded-md p-1 text-content-muted hover:text-content md:hidden"
          >
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                onClick={onClose}
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

          <div className="mt-auto space-y-1 border-t border-surface-3 pt-3">
            {SECONDARY_ITEMS.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  onClick={onClose}
                  className={clsx(
                    'focus-ignite flex items-center gap-3 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'bg-ignite/15 text-ignite-light'
                      : 'text-content-muted hover:bg-surface-2 hover:text-content'
                  )}
                >
                  <i className={`bi ${item.icon}`} aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </aside>
    </>
  );
}
