import clsx from 'clsx';

/**
 * In-page placeholder for a list or panel that has no rows yet. Distinct from
 * NoSearchResults: this means "nothing exists", which is an invitation to
 * create something, not a dead end.
 */
export function EmptyState({
  icon = 'bi-inbox',
  title,
  description,
  action,
  className,
}: {
  icon?: string;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-surface-3 bg-surface-1/50 px-6 py-12 text-center',
        className
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2">
        <i className={clsx('bi', icon, 'text-xl text-content-muted')} aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-content">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-content-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
