import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Spinner } from './Spinner';
import {
  buttonClasses,
  type ButtonSize,
  type ButtonVariant,
} from './button-styles';

// Re-export for callers that imported these types from Button.tsx.
export type { ButtonSize, ButtonVariant };

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Show a spinner and disable interactions. */
  loading?: boolean;
  /** Optional icon rendered before the children. */
  leadingIcon?: ReactNode;
  children: ReactNode;
}

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
      className={buttonClasses(variant, size, className)}
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
