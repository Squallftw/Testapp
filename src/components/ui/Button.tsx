import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
// `xs` exists for tight contexts (action bars, table row buttons, inline
// toolbars). It's deliberately a 28px target — fine on desktop, marginal on
// touch, so don't use it for primary mobile actions.
export type ButtonSize = 'xs' | 'sm' | 'md';

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
  // Two-ring focus treatment: a tight 2px ring in the brand colour, offset
  // by 2px in the page background so it reads cleanly on cards AND on the
  // bati-bg parchment. Matches `.bati-input` focus chrome.
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-bati-teal/55 ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-bati-bg ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none';

const SIZE: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-xs',
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
};

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-bati-teal text-white hover:bg-bati-teal-deep active:translate-y-px shadow-sm hover:shadow',
  secondary:
    'bg-bati-card text-bati-text border border-bati-border hover:bg-bati-border-soft hover:border-bati-muted/30',
  ghost: 'text-bati-text hover:bg-bati-border-soft',
  destructive:
    'bg-bati-terra text-white hover:bg-[#a04832] active:translate-y-px shadow-sm hover:shadow',
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
