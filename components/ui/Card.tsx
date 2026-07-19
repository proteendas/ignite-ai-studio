import clsx from 'clsx';

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'rounded-lg border border-surface-3 bg-surface-1 p-6 shadow-sm',
        className
      )}
    >
      {children}
    </div>
  );
}
