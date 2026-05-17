interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  /** CSS color (var or hex). Default: --bati-teal. */
  color?: string;
  /** If true, fill area under the line. */
  showArea?: boolean;
  /** Stroke width in SVG units. Default 1.5. */
  strokeWidth?: number;
  className?: string;
}

/**
 * Tiny hand-rolled SVG sparkline. Decorative — actual numbers should be
 * stated elsewhere on the page (sparklines are glyphs, not labelled charts).
 */
export function Sparkline({
  values,
  width = 80,
  height = 24,
  color = 'var(--bati-teal)',
  showArea = false,
  strokeWidth = 1.5,
  className,
}: SparklineProps) {
  if (values.length === 0) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={className}
        aria-hidden
      >
        <line
          x1={0}
          x2={width}
          y1={height - 1}
          y2={height - 1}
          stroke="var(--bati-border)"
          strokeWidth={1}
        />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const pad = 1; // 1 SVG unit of vertical padding so the line never clips
  const usableH = height - pad * 2;

  const xFor = (i: number) =>
    values.length === 1 ? width / 2 : (i / (values.length - 1)) * width;
  const yFor = (v: number) => {
    if (range === 0) return height / 2;
    return pad + (1 - (v - min) / range) * usableH;
  };

  const points = values.map((v, i) => `${xFor(i)},${yFor(v)}`).join(' ');
  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
    >
      {showArea && (
        <polygon points={areaPoints} fill={color} fillOpacity={0.12} />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
