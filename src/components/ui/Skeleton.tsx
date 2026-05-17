interface SkeletonProps {
  className?: string;
  /** Number of pulsing bars when used as a list placeholder. */
  rows?: number;
}

export function Skeleton({ className = '', rows }: SkeletonProps) {
  if (rows && rows > 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className={`animate-pulse rounded bg-bati-border-soft h-4 ${className}`}
          />
        ))}
      </div>
    );
  }
  return (
    <div className={`animate-pulse rounded bg-bati-border-soft ${className}`} />
  );
}
