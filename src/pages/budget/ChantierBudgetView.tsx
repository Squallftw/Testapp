import { useQuery } from '@tanstack/react-query';
import { type Chantier } from '@/data/chantiers';
import { getSummary } from '@/data/budget-engine';
import { useOrg } from '@/contexts/OrgContext';
import { formatMAD, formatPercent } from '@/lib/format';
import { PaymentsSection } from './PaymentsSection';

export type ChantierBudgetTab = 'pointage' | 'consommables';

interface ChantierBudgetViewProps {
  chantier: Chantier;
  /** Switch tab inside the parent ChantierDetailPage without changing route. */
  onNavigateTab?: (tab: ChantierBudgetTab) => void;
}

/**
 * Chantier-scoped budget breakdown: labor/materials/total progress bars, plus
 * payments-received and remaining-headroom cards. Click-throughs switch the
 * parent's active tab rather than navigating away.
 */
export function ChantierBudgetView({ chantier, onNavigateTab }: ChantierBudgetViewProps) {
  const { activeOrg, myRole } = useOrg();
  const canManagePayments = myRole === 'owner' || myRole === 'admin';

  const summary = useQuery({
    queryKey: ['budget-summary', activeOrg?.id, chantier.id],
    queryFn: () => getSummary(chantier.id),
    enabled: !!activeOrg,
  });

  const s = summary.data ?? {
    chantier_id: chantier.id,
    labor_spent: 0,
    materials_spent: 0,
    equipment_spent: 0,
    payments_received: 0,
    total_spent: 0,
    remaining: 0,
  };

  const laborPct = chantier.budget_labor > 0 ? s.labor_spent / chantier.budget_labor : 0;
  const materialsPct =
    chantier.budget_materials > 0 ? s.materials_spent / chantier.budget_materials : 0;
  const totalPct = chantier.budget_total > 0 ? s.total_spent / chantier.budget_total : 0;
  const paymentsPct =
    chantier.contract_value > 0 ? s.payments_received / chantier.contract_value : 0;
  const remaining = chantier.budget_total - s.total_spent;
  const cashPosition = s.payments_received - s.total_spent;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <BudgetBar
          label="Main d'œuvre"
          spent={s.labor_spent}
          budget={chantier.budget_labor}
          pct={laborPct}
          isLoading={summary.isLoading}
          onClick={onNavigateTab ? () => onNavigateTab('pointage') : undefined}
          cta="Voir le pointage →"
        />
        <BudgetBar
          label="Matériaux"
          spent={s.materials_spent}
          budget={chantier.budget_materials}
          pct={materialsPct}
          isLoading={summary.isLoading}
          onClick={onNavigateTab ? () => onNavigateTab('consommables') : undefined}
          cta="Voir la consommation →"
        />
        <BudgetBar
          label="Total"
          spent={s.total_spent}
          budget={chantier.budget_total}
          pct={totalPct}
          isLoading={summary.isLoading}
          emphasis
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Matériel (équipement)"
          value={formatMAD(s.equipment_spent)}
          subtitle="Suivi post-bêta"
        />
        <StatCard
          label="Paiements reçus"
          value={formatMAD(s.payments_received)}
          subtitle={
            chantier.contract_value > 0
              ? `${formatPercent(paymentsPct)} du contrat`
              : undefined
          }
          accent="teal"
        />
        <StatCard
          label={remaining >= 0 ? 'Budget restant' : 'Dépassement'}
          value={formatMAD(Math.abs(remaining))}
          subtitle={
            chantier.budget_total > 0
              ? `Budget total ${formatMAD(chantier.budget_total)}`
              : 'Aucun budget défini'
          }
          accent={remaining >= 0 ? 'success' : 'terra'}
        />
      </div>

      <div className="bati-card rounded-lg p-4">
        <div className="text-xs uppercase tracking-wide text-bati-muted">
          Position de trésorerie (paiements reçus − coûts engagés)
        </div>
        <div
          className={`text-xl font-bold mt-2 tabular-nums ${
            cashPosition >= 0 ? 'text-bati-success' : 'text-bati-terra'
          }`}
        >
          {cashPosition >= 0 ? '+' : '−'} {formatMAD(Math.abs(cashPosition))}
        </div>
        <p className="text-xs text-bati-muted mt-1">
          {cashPosition >= 0
            ? "Les paiements reçus couvrent les coûts engagés à ce stade."
            : 'Les coûts engagés dépassent les paiements reçus — surveillez la trésorerie.'}
        </p>
      </div>

      {canManagePayments && (
        <PaymentsSection
          chantierId={chantier.id}
          contractValue={chantier.contract_value}
        />
      )}
    </div>
  );
}

interface BudgetBarProps {
  label: string;
  spent: number;
  budget: number;
  pct: number;
  isLoading: boolean;
  emphasis?: boolean;
  onClick?: () => void;
  cta?: string;
}

function BudgetBar({
  label,
  spent,
  budget,
  pct,
  isLoading,
  emphasis = false,
  onClick,
  cta,
}: BudgetBarProps) {
  const variance = budget - spent;
  const barColor =
    pct > 1 ? 'bg-bati-terra' : pct > 0.8 ? 'bg-bati-ochre' : 'bg-bati-success';
  const textColor =
    pct > 1 ? 'text-bati-terra' : pct > 0.8 ? 'text-bati-ochre' : 'text-bati-success';
  const widthPct = Math.min(100, pct * 100);

  const inner = (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className={`font-medium ${emphasis ? 'text-bati-text' : 'text-bati-muted'}`}>
          {label}
        </span>
        <span className={`tabular-nums ${textColor} font-semibold`}>
          {budget > 0 ? formatPercent(pct) : '—'}
        </span>
      </div>
      <div className="h-2 bg-bati-border-soft rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="tabular-nums text-bati-muted">
          {isLoading ? '…' : formatMAD(spent)} / {formatMAD(budget)}
        </span>
        {budget > 0 && (
          <span
            className={`tabular-nums text-xs ${
              variance < 0 ? 'text-bati-terra' : 'text-bati-muted'
            }`}
          >
            {variance >= 0 ? 'Reste ' : 'Dépassement '}
            {formatMAD(Math.abs(variance))}
          </span>
        )}
      </div>
      {cta && onClick && (
        <div className="pt-1 text-[11px] text-bati-teal group-hover:underline">{cta}</div>
      )}
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="bati-card rounded-lg p-4 text-left w-full hover:bg-bati-border-soft transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bati-teal group"
      >
        {inner}
      </button>
    );
  }

  return <div className="bati-card rounded-lg p-4">{inner}</div>;
}

const ACCENT_CLASS: Record<string, string> = {
  teal: 'text-bati-teal',
  terra: 'text-bati-terra',
  success: 'text-bati-success',
  muted: 'text-bati-text',
};

function StatCard({
  label,
  value,
  subtitle,
  accent = 'muted',
}: {
  label: string;
  value: React.ReactNode;
  subtitle?: string;
  accent?: 'teal' | 'terra' | 'success' | 'muted';
}) {
  return (
    <div className="bati-card rounded-lg p-4">
      <div className="text-xs uppercase tracking-wide text-bati-muted">{label}</div>
      <div className={`text-xl font-bold mt-2 tabular-nums ${ACCENT_CLASS[accent]}`}>
        {value}
      </div>
      {subtitle && <div className="text-xs text-bati-muted mt-1">{subtitle}</div>}
    </div>
  );
}
