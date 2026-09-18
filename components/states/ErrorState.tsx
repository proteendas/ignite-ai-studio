'use client';

import clsx from 'clsx';

/**
 * In-page failure block for a panel or list that could not load. `onRetry`
 * should re-run the same fetch; without it the user is left with no way
 * forward, so pass one wherever the action is repeatable.
 */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  className,
}: {
  title?: string;
  message?: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={clsx(
        'flex flex-col items-center justify-center rounded-lg border border-ignite/40 bg-ignite/5 px-6 py-10 text-center',
        className
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-ignite/15">
        <i className="bi bi-exclamation-triangle text-xl text-ignite" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-content">{title}</p>
      {message && <p className="mt-1.5 max-w-sm text-sm text-content-muted">{message}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="focus-ignite hover-glow mt-5 inline-flex items-center gap-2 rounded-md bg-ignite px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ignite-dark"
        >
          <i className="bi bi-arrow-clockwise" aria-hidden="true" />
          {retryLabel}
        </button>
      )}
    </div>
  );
}
