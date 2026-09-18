import Link from 'next/link';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

/**
 * Chrome for the signed-out account pages (forgot password, reset password,
 * email verification). Mirrors the login page's framing and carries the legal
 * footer, since the policies must be reachable from the signed-out side too.
 */
export function AuthShell({
  icon,
  title,
  description,
  children,
  footer,
}: {
  icon: string;
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-base">
      <header className="flex h-14 shrink-0 items-center justify-between px-4 md:px-8">
        <Link
          href="/login"
          className="focus-ignite flex items-center gap-2 text-sm font-semibold text-content"
        >
          <i className="bi bi-fire text-lg text-ignite" aria-hidden="true" />
          IgniteAI Studio
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-ignite/40 bg-ignite/10">
              <i className={`bi ${icon} text-xl text-ignite`} aria-hidden="true" />
            </div>
            <h1 className="text-lg font-semibold text-content">{title}</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-content-muted">{description}</p>
          </div>

          <div className="rounded-lg border border-surface-3 bg-surface-1 p-6 shadow-sm">
            {children}
          </div>

          {footer && <div className="mt-5 text-center text-sm text-content-muted">{footer}</div>}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
