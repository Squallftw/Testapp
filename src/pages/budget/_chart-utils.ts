/** Resolves a budget-bar / chart accent colour based on a usage ratio (spent / budget). */
export function pctAccent(pct: number): 'success' | 'ochre' | 'terra' {
  if (pct > 1) return 'terra';
  if (pct > 0.8) return 'ochre';
  return 'success';
}

/**
 * Brand-palette hex codes pulled from `src/index.css`'s :root variables.
 * Recharts needs literal values (not CSS variables) for stroke/fill on its
 * SVG primitives — duplicating them here keeps the modal self-contained.
 */
export const CHART_COLOURS = {
  teal: '#0E5460',
  terra: '#C25B3F',
  ochre: '#C58122',
  success: '#2E9152',
  muted: '#6B6359',
  tealSoft: '#D8E5E7',
  terraSoft: '#F2DCD3',
  softBorder: '#E5E7EB',
} as const;
