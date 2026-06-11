import { Link } from 'react-router-dom';
import { formatMAD, formatPercent } from '@/lib/format';
import type { ChantierForesight, RiskLevel } from '@/lib/foresight';
import { EmptyState } from '@/components/ui/EmptyState';
import { RiskBadge } from './RiskBadge';

interface RiskRankedListProps {
  chantiers: ChantierForesight[];
  /** Empty-state message when the list is empty (post-filtering). */
  emptyMessage?: string;
}

const RISK_RANK: Record<RiskLevel, number> = { red: 0, yellow: 1, green: 2 };

export function RiskRankedList({
  chantiers,
  emptyMessage = 'Aucun chantier actif',
}: RiskRankedListProps) {
  const sorted = [...chantiers].sort((a, b) => {
    const rankDiff = RISK_RANK[a.risk.level] - RISK_RANK[b.risk.level];
    if (rankDiff !== 0) return rankDiff;
    // Within the same level, biggest cost variance first (insufficient → last).
    const aVar = a.cost.kind === 'ok' ? a.cost.variancePct : -Infinity;
    const bVar = b.cost.kind === 'ok' ? b.cost.variancePct : -Infinity;
    return bVar - aVar;
  });

  if (sorted.length === 0) {
    return <EmptyState title={emptyMessage} />;
  }

  return (
    <div className="bati-card rounded-xl overflow-hidden">
      <ul className="divide-y divide-bati-border">
        {sorted.map((c) => (
          <li key={c.chantierId}>
            <Link
              to={`/chantiers/${c.chantierId}`}
              className="block px-4 py-3 hover:bg-bati-border-soft/40 focus:outline-none focus-visible:bg-bati-border-soft"
            >
              <div className="flex items-center gap-3">
                <RiskBadge level={c.risk.level} dotOnly />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <div className="font-semibold text-bati-text truncate">
                      {c.chantierName}
                    </div>
                    <div className="flex items-center gap-3 text-xs tabular-nums shrink-0">
                      <CostDelta cost={c.cost} />
                      <ScheduleDelta schedule={c.schedule} />
                    </div>
                  </div>
                  {c.risk.drivers[0] ? (
                    <div className="mt-0.5 text-xs text-bati-muted truncate">
                      {c.risk.drivers[0].message}
                      {c.risk.drivers.length > 1 ? (
                        <span className="ml-1 text-bati-muted/70">
                          · +{c.risk.drivers.length - 1}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-0.5 text-xs text-bati-muted">
                      Sur les rails
                    </div>
                  )}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CostDelta({ cost }: { cost: ChantierForesight['cost'] }) {
  if (cost.kind !== 'ok') {
    return <span className="text-bati-muted/70">—</span>;
  }
  const tone =
    cost.variancePct >= 0.15
      ? 'text-bati-terra'
      : cost.variancePct >= 0.05
        ? 'text-bati-ochre'
        : 'text-bati-muted';
  return (
    <span title={`Projeté: ${formatMAD(cost.projected)}`}>
      <span className="text-bati-muted">Budget </span>
      <span className={`font-semibold ${tone}`}>
        {cost.variancePct >= 0 ? '+' : ''}
        {formatPercent(cost.variancePct)}
      </span>
    </span>
  );
}

function ScheduleDelta({ schedule }: { schedule: ChantierForesight['schedule'] }) {
  if (schedule.kind !== 'ok') {
    return <span className="text-bati-muted/70">—</span>;
  }
  const tone =
    schedule.deltaDays >= 15
      ? 'text-bati-terra'
      : schedule.deltaDays >= 5
        ? 'text-bati-ochre'
        : 'text-bati-muted';
  return (
    <span>
      <span className="text-bati-muted">Délai </span>
      <span className={`font-semibold ${tone}`}>
        {schedule.deltaDays > 0 ? '+' : ''}
        {schedule.deltaDays}j
      </span>
    </span>
  );
}
