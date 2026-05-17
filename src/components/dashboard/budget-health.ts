export type BudgetHealth = 'sain' | 'attention' | 'depassement' | 'unknown';

/**
 * Classify a budget-consumption ratio into a health bucket.
 * Mirrors the threshold colors used in BudgetBar (BudgetDashboardPage.tsx:199).
 *
 * - sain         pct ≤ 0.8   (green)
 * - attention   0.8 < pct ≤ 1   (ochre)
 * - depassement  pct > 1     (terra)
 * - unknown      no budget defined (caller responsibility to pass NaN/Infinity)
 */
export function getBudgetHealth(pct: number): BudgetHealth {
  if (!Number.isFinite(pct)) return 'unknown';
  if (pct > 1) return 'depassement';
  if (pct > 0.8) return 'attention';
  return 'sain';
}

export const HEALTH_BAR_BG: Record<BudgetHealth, string> = {
  sain: 'bg-bati-success',
  attention: 'bg-bati-ochre',
  depassement: 'bg-bati-terra',
  unknown: 'bg-bati-border',
};

export const HEALTH_TEXT: Record<BudgetHealth, string> = {
  sain: 'text-bati-success',
  attention: 'text-bati-ochre',
  depassement: 'text-bati-terra',
  unknown: 'text-bati-muted',
};

export const HEALTH_LABEL: Record<BudgetHealth, string> = {
  sain: 'Sain',
  attention: 'Attention',
  depassement: 'Dépassement',
  unknown: 'Budget non défini',
};
