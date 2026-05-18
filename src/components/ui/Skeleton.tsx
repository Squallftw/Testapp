interface SkeletonProps {
  className?: string;
  /** Number of placeholder bars when used as a list placeholder. */
  rows?: number;
  /**
   * Loading animation. `shimmer` (default) is a horizontal sweep — quieter
   * than a pulse and preferred for table-row stacks where multiple pulses
   * at once feel busy. `pulse` stays available for single-bar cases or
   * places where the calmer breathing rhythm is intentional.
   */
  variant?: 'pulse' | 'shimmer';
}

export function Skeleton({ className = '', rows, variant = 'shimmer' }: SkeletonProps) {
  const animClass = variant === 'pulse' ? 'animate-pulse bg-bati-border-soft' : 'bati-shimmer';
  if (rows && rows > 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className={`${animClass} rounded h-4 ${className}`} />
        ))}
      </div>
    );
  }
  return <div className={`${animClass} rounded ${className}`} />;
}
