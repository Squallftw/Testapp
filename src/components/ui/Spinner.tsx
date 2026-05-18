interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  /** Tailwind text-color class (e.g. "text-bati-teal", "text-white"). Defaults to currentColor. */
  className?: string;
  /** Optional accessible label. If omitted, the spinner is treated as decorative. */
  label?: string;
}

const SIZES: Record<NonNullable<SpinnerProps['size']>, number> = {
  sm: 16,
  md: 20,
  lg: 24,
};

/**
 * Small spinner used inside buttons (loading state) and on page-level
 * loading shells where bare "Chargement…" text doesn't give enough feedback.
 * Stroke-only — inherits color from currentColor so it adapts to dark/light
 * backgrounds automatically.
 */
export function Spinner({ size = 'md', className = '', label }: SpinnerProps) {
  const px = SIZES[size];
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      className={`${className} animate-spin`}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="3"
      />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
