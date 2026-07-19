import clsx from 'clsx';
import { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variantStyles: Record<Variant, string> = {
  primary: 'bg-ignite text-white hover:bg-ignite-dark disabled:bg-ignite/40 hover-glow',
  secondary:
    'bg-surface-2 text-content border border-surface-3 hover:bg-surface-3 hover-glow',
  ghost: 'text-content-muted hover:bg-surface-2 hover:text-content',
  danger: 'bg-ignite-dark text-white hover:bg-ignite disabled:bg-ignite-dark/40',
};

export function Button({
  variant = 'primary',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={clsx(
        'focus-ignite inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed',
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
