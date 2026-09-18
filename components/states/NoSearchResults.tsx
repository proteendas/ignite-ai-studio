import clsx from 'clsx';

/**
 * Shown when a filter or query matched nothing but rows do exist. Always names
 * the query back to the user so it is obvious what was searched for, and offers
 * a way out via `onClear`.
 */
export function NoSearchResults({
  query,
  onClear,
  suggestion = 'Check the spelling, or try a broader term.',
  className,
}: {
  query?: string;
  onClear?: () => void;
  suggestion?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center rounded-lg border border-surface-3 bg-surface-1 px-6 py-12 text-center',
        className
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2">
        <i className="bi bi-search text-xl text-content-muted" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-content">
        {query ? (
          <>
            No results for <span className="text-ignite-light">&ldquo;{query}&rdquo;</span>
          </>
        ) : (
          'No matching results'
        )}
      </p>
      <p className="mt-1.5 max-w-sm text-sm text-content-muted">{suggestion}</p>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="focus-ignite mt-5 inline-flex items-center gap-2 rounded-md border border-surface-3 bg-surface-2 px-3 py-1.5 text-sm text-content transition-colors hover:bg-surface-3"
        >
          <i className="bi bi-x-circle" aria-hidden="true" />
          Clear search
        </button>
      )}
    </div>
  );
}
