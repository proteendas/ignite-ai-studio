import Link from 'next/link';
import clsx from 'clsx';

type Tone = 'brand' | 'neutral' | 'success';

const toneStyles: Record<Tone, { ring: string; icon: string }> = {
  brand: { ring: 'border-ignite/40 bg-ignite/10', icon: 'text-ignite' },
  neutral: { ring: 'border-surface-3 bg-surface-2', icon: 'text-content-muted' },
  success: { ring: 'border-emerald-500/30 bg-emerald-500/10', icon: 'text-emerald-400' },
};

export interface StatusAction {
  href: string;
  label: string;
  icon?: string;
  variant?: 'primary' | 'secondary';
}

/**
 * Full-viewport status screen shared by every standalone outcome route
 * (404, 403, 500, maintenance, offline, session expired, verification results).
 * Keeping them on one component means all of these read as the same product
 * rather than as seven differently-styled dead ends.
 */
export function StatusPage({
  code,
  icon,
  title,
  description,
  tone = 'brand',
  actions = [],
  children,
}: {
  code?: string;
  icon: string;
  title: string;
  description: React.ReactNode;
  tone?: Tone;
  actions?: StatusAction[];
  children?: React.ReactNode;
}) {
  const styles = toneStyles[tone];

  return (
    <main className="flex min-h-screen items-center justify-center bg-base px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div
          className={clsx(
            'mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border',
            styles.ring
          )}
        >
          <i className={clsx('bi', icon, 'text-2xl', styles.icon)} aria-hidden="true" />
        </div>

        {code && (
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-content-muted">
            Error {code}
          </p>
        )}

        <h1 className="text-xl font-semibold text-content">{title}</h1>
        <div className="mt-2 text-sm leading-relaxed text-content-muted">{description}</div>

        {children && <div className="mt-6">{children}</div>}

        {actions.length > 0 && (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className={clsx(
                  'focus-ignite hover-glow inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
                  action.variant === 'secondary'
                    ? 'border border-surface-3 bg-surface-2 text-content hover:bg-surface-3'
                    : 'bg-ignite text-white hover:bg-ignite-dark'
                )}
              >
                {action.icon && <i className={clsx('bi', action.icon)} aria-hidden="true" />}
                {action.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
