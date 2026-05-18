// supabase/functions/recompute-alerts/helpers.ts

/** Inclusive day count from start to end. Negative (also inclusive) when end < start. */
export function daysBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso + 'T00:00:00Z').getTime();
  const end = new Date(endIso + 'T00:00:00Z').getTime();
  return Math.round((end - start) / 86_400_000) + (end >= start ? 1 : -1);
}

/** Format an amount in MAD with non-breaking thousand separators. */
export function formatMAD(amount: number): string {
  const rounded = Math.round(amount);
  const withSep = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${withSep} MAD`;
}

/** Format a ratio (0.93 → "93 %"). Always rounds to integer percent. */
export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)} %`;
}

/** Today as yyyy-mm-dd in UTC. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
