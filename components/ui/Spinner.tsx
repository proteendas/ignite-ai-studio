import clsx from 'clsx';

/** Loading spinner using Bootstrap Icons (bi-arrow-repeat) per the design system. */
export function Spinner({ className }: { className?: string }) {
  return (
    <i
      className={clsx('bi bi-arrow-repeat inline-block animate-spin-slow', className)}
      aria-hidden="true"
    />
  );
}
