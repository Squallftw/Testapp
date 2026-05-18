import { forwardRef, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import {
  buttonClasses,
  type ButtonSize,
  type ButtonVariant,
} from './button-styles';

// Use this whenever you want a navigation that LOOKS like a button — e.g.
// the "Créer un chantier" CTA on an empty state, or any toolbar action that
// changes the URL. Renders react-router's <Link> with Button's classes, so
// focus rings, hover, sizes and variants all stay pixel-identical.

interface ButtonLinkProps extends Omit<LinkProps, 'className'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  className?: string;
  children: ReactNode;
}

export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(
  function ButtonLink(
    {
      variant = 'primary',
      size = 'md',
      leadingIcon,
      className = '',
      children,
      ...rest
    },
    ref
  ) {
    return (
      <Link ref={ref} className={buttonClasses(variant, size, className)} {...rest}>
        {leadingIcon && (
          <span aria-hidden className="inline-flex shrink-0">
            {leadingIcon}
          </span>
        )}
        {children}
      </Link>
    );
  }
);
