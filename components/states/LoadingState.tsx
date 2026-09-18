import clsx from 'clsx';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Indeterminate in-page loading block. Prefer a Skeleton when the shape of the
 * incoming content is known — a skeleton that matches the final layout avoids
 * the jump this spinner causes.
 */
export function LoadingState({
  label = 'Loading…',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-surface-3 bg-surface-1 px-6 py-12 text-center',
        className
      )}
    >
      <Spinner />
      <p className="text-sm text-content-muted">{label}</p>
    </div>
  );
}
