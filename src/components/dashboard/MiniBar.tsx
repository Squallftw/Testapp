import { formatMAD, formatPercent } from '@/lib/format';
import { getBudgetHealth, HEALTH_BAR_BG, HEALTH_TEXT } from './budget-health';

interface MiniBarProps {
  label: string;
  spent: number;
  budget: number;
  emphasis?: boolean;
}

/**
 * Compact, non-clickable progress bar used inside ChantierScoreCard.
 * For the clickable, CTA-equipped version see BudgetBar in BudgetDashboardPage.
 */
export function MiniBar({ label, spent, budget, emphasis = false }: MiniBarProps) {
  const hasBudget = budget > 0;
  const pct = hasBudget ? spent / budget : 0;
  const health = hasBudget ? getBudgetHealth(pct) : 'unknown';
  const widthPct = hasBudget ? Math.min(100, pct * 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span
          className={`${emphasis ? 'font-semibold text-bati-text' : 'font-medium text-bati-muted'}`}
        >
          {label}
        </span>
        <span className={`tabular-nums font-semibold ${HEALTH_TEXT[health]}`}>
          {hasBudget ? formatPercent(pct) : '—'}
        </span>
      </div>
      <div className="h-1.5 bg-bati-border-soft rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${HEALTH_BAR_BG[health]}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <div className="text-[11px] tabular-nums text-bati-muted">
        {formatMAD(spent)} / {hasBudget ? formatMAD(budget) : '—'}
      </div>
    </div>
  );
}
