import clsx from 'clsx';

/**
 * Confirmation block for a completed action. Emerald is used here as the one
 * sanctioned non-red status accent (see the design constitution) — success must
 * not read as the brand's ignite red, which signals action or danger elsewhere.
 */
export function SuccessState({
  title,
  message,
  action,
  className,
}: {
  title: string;
  message?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={clsx(
        'flex flex-col items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-6 py-10 text-center',
        className
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
        <i className="bi bi-check-lg text-xl text-emerald-400" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-content">{title}</p>
      {message && <p className="mt-1.5 max-w-sm text-sm text-content-muted">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
