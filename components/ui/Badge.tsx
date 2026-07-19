import clsx from 'clsx';

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'brand';

// Tones stay within the red/black system; success uses a muted emerald only as
// a minimal status accent (constitution #7).
const toneStyles: Record<BadgeTone, string> = {
  neutral: 'bg-surface-3 text-content-muted',
  success: 'bg-emerald-500/15 text-emerald-400',
  warning: 'bg-ignite/15 text-ignite-light',
  danger: 'bg-ignite-dark/25 text-ignite-light',
  brand: 'bg-ignite/20 text-ignite-light',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        toneStyles[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
