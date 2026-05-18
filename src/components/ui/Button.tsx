import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Show a spinner and disable interactions. */
  loading?: boolean;
  /** Optional icon rendered before the children. */
  leadingIcon?: ReactNode;
  children: ReactNode;
}

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium ' +
  'transition-[background-color,opacity,transform,box-shadow] duration-150 ' +
  'focus:outline-none focus-visible:ring focus-visible:ring-bati-teal/30 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none';

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
};

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-bati-teal text-white hover:bg-bati-teal-deep active:translate-y-[1px] shadow-sm hover:shadow',
  secondary:
    'bg-bati-card text-bati-text border border-bati-border hover:bg-bati-border-soft',
  ghost: 'text-bati-text hover:bg-bati-border-soft',
  destructive:
    'bg-bati-terra text-white hover:opacity-90 active:translate-y-[1px] shadow-sm hover:shadow',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leadingIcon,
    children,
    className = '',
    disabled,
    type = 'button',
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={`${BASE} ${SIZE[size]} ${VARIANT[variant]} ${className}`}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Spinner size="sm" />
      ) : leadingIcon ? (
        <span aria-hidden className="inline-flex shrink-0">
          {leadingIcon}
        </span>
      ) : null}
      {children}
    </button>
  );
});
