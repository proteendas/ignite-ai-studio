import clsx from 'clsx';

/** Pulsing placeholder block for loading states (ingestion, generation, lists). */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={clsx('animate-pulse rounded-md bg-surface-3/60', className)}
      aria-hidden="true"
    />
  );
}
