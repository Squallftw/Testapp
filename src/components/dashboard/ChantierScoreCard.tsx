import { Link } from 'react-router-dom';
import type { Chantier } from '@/data/chantiers';
import type { BudgetSummary } from '@/data/budget-engine';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatMAD } from '@/lib/format';
import { MiniBar } from './MiniBar';
import { Sparkline } from './Sparkline';
import {
  getBudgetHealth,
  HEALTH_LABEL,
  HEALTH_TEXT,
  type BudgetHealth,
} from './budget-health';

interface ChantierScoreCardProps {
  chantier: Chantier;
  summary: BudgetSummary;
  /** 14 daily labor cost totals (oldest first). Empty array OK. */
  laborTimeSeries: number[];
  presentToday: number;
  tasks: { done: number; total: number };
}

const HEALTH_DOT_COLOR: Record<BudgetHealth, string> = {
  sain: 'bg-bati-success',
  attention: 'bg-bati-ochre',
  depassement: 'bg-bati-terra',
  unknown: 'bg-bati-border',
};

export function ChantierScoreCard({
  chantier,
  summary,
  laborTimeSeries,
  presentToday,
  tasks,
}: ChantierScoreCardProps) {
  const totalPct =
    chantier.budget_total > 0 ? summary.total_spent / chantier.budget_total : NaN;
  const health = Number.isFinite(totalPct) ? getBudgetHealth(totalPct) : 'unknown';

  const cashPosition = summary.payments_received - summary.total_spent;

  return (
    <Link
      to={`/chantiers/${chantier.id}`}
      className="block bati-card bati-elev-hover rounded-xl p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-bati-teal"
    >
      <div className="flex items-start gap-3">
        <div
          className="w-1.5 self-stretch min-h-[3rem] rounded-full shrink-0"
          style={{ background: chantier.color ?? 'var(--bati-border)' }}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h3 className="text-base font-bold text-bati-text truncate">
                {chantier.name}
              </h3>
              <div className="mt-1 flex items-center gap-2 text-xs text-bati-muted">
                <StatusBadge status={chantier.status} />
                {chantier.client_name && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="truncate">{chantier.client_name}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className={`w-2 h-2 rounded-full ${HEALTH_DOT_COLOR[health]}`}
                aria-hidden
              />
              <span className={`text-xs font-semibold ${HEALTH_TEXT[health]}`}>
                {HEALTH_LABEL[health]}
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-5 items-start">
            <div className="space-y-2.5">
              <MiniBar
                label="Main d'œuvre"
                spent={summary.labor_spent}
                budget={chantier.budget_labor}
              />
              <MiniBar
                label="Matériaux"
                spent={summary.materials_spent}
                budget={chantier.budget_materials}
              />
              <MiniBar
                label="Matériels"
                spent={summary.equipment_spent}
                budget={chantier.budget_equipment}
              />
              <MiniBar
                label="Total"
                spent={summary.total_spent}
                budget={chantier.budget_total}
                emphasis
              />
            </div>
            <div className="flex flex-col items-end gap-1">
              <Sparkline
                values={laborTimeSeries}
                width={120}
                height={36}
                showArea
              />
              <span className="text-[10px] uppercase tracking-wide text-bati-muted">
                Coût MO · 14j
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
            <Stat
              label="Trésorerie"
              value={
                <span
                  className={
                    cashPosition >= 0 ? 'text-bati-success' : 'text-bati-terra'
                  }
                >
                  {cashPosition >= 0 ? '+' : '−'} {formatMAD(Math.abs(cashPosition))}
                </span>
              }
            />
            <Stat
              label="Présents aujourd'hui"
              value={
                <span className="text-bati-text tabular-nums">{presentToday}</span>
              }
            />
            <Stat
              label="Tâches"
              value={
                tasks.total === 0 ? (
                  <span className="text-bati-muted">—</span>
                ) : (
                  <span className="text-bati-text tabular-nums">
                    {tasks.done} / {tasks.total}
                  </span>
                )
              }
            />
          </div>
        </div>
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-bati-muted">
        {label}
      </div>
      <div className="text-sm font-bold mt-0.5">{value}</div>
    </div>
  );
}
