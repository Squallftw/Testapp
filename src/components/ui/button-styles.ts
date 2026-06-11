// Shared visual tokens for `<Button>` and `<ButtonLink>`. Both surfaces
// (action buttons and Link-styled-as-buttons) must look pixel-identical,
// so the classes live here and the two primitives import them.

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
// `xs` exists for tight contexts (action bars, table-row buttons, inline
// toolbars). It's deliberately a 28px target — fine on desktop, marginal on
// touch, so don't use it for primary mobile actions.
export type ButtonSize = 'xs' | 'sm' | 'md';

export const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium ' +
  'transition-[background-color,opacity,transform,box-shadow] duration-150 ' +
  // Two-ring focus treatment: a tight 2px ring in the brand colour, offset
  // by 2px in the page background so it reads cleanly on cards AND on the
  // bati-bg canvas. Matches `.bati-input` focus chrome.
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-bati-primary/55 ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-bati-bg ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none ' +
  // ButtonLink needs `no-underline` since Link inherits anchor underline in
  // some global resets; harmless on the <button> path.
  'no-underline';

export const BUTTON_SIZE: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-xs',
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
};

export const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-bati-primary text-white hover:bg-bati-primary-deep active:translate-y-px shadow-sm hover:shadow',
  secondary:
    'bg-bati-card text-bati-text border border-bati-border hover:bg-bati-border-soft hover:border-bati-muted/30',
  ghost: 'text-bati-text hover:bg-bati-border-soft',
  destructive:
    'bg-bati-terra text-white hover:bg-[#bb4230] active:translate-y-px shadow-sm hover:shadow',
};

export function buttonClasses(
  variant: ButtonVariant,
  size: ButtonSize,
  extra = ''
): string {
  return `${BUTTON_BASE} ${BUTTON_SIZE[size]} ${BUTTON_VARIANT[variant]} ${extra}`;
}
