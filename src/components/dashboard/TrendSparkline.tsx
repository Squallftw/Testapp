interface TrendSparklineProps {
  /** Actual observed series. */
  values: number[];
  /**
   * Optional reference series the actual is compared against (same length).
   * Rendered as a dashed muted line behind the main line.
   */
  baseline?: number[];
  width?: number;
  height?: number;
  /** Color for the main line. Defaults to bati-teal. */
  color?: string;
  baselineColor?: string;
  showArea?: boolean;
  strokeWidth?: number;
  className?: string;
}

/**
 * Sparkline with an optional baseline overlay. When the actual line is above
 * the baseline you're projecting over (cost burn), below it you're projecting
 * under or behind (task velocity). The two together let the reader see the
 * trajectory at a glance without a labelled chart.
 */
export function TrendSparkline({
  values,
  baseline,
  width = 120,
  height = 36,
  color = 'var(--bati-teal)',
  baselineColor = 'var(--bati-muted)',
  showArea = false,
  strokeWidth = 1.5,
  className,
}: TrendSparklineProps) {
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

  const allValues = baseline ? [...values, ...baseline] : values;
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min;
  const pad = 1;
  const usableH = height - pad * 2;

  function xFor(i: number, total: number): number {
    return total === 1 ? width / 2 : (i / (total - 1)) * width;
  }
  function yFor(v: number): number {
    if (range === 0) return height / 2;
    return pad + (1 - (v - min) / range) * usableH;
  }

  const mainPoints = values.map((v, i) => `${xFor(i, values.length)},${yFor(v)}`).join(' ');
  const areaPoints = `0,${height} ${mainPoints} ${width},${height}`;
  const baselinePoints = baseline
    ? baseline.map((v, i) => `${xFor(i, baseline.length)},${yFor(v)}`).join(' ')
    : '';

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
      {baseline && (
        <polyline
          points={baselinePoints}
          fill="none"
          stroke={baselineColor}
          strokeWidth={1}
          strokeDasharray="2 2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.6}
        />
      )}
      <polyline
        points={mainPoints}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
