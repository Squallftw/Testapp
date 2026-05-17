import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listChantiers, type Chantier, type ChantierStatus } from '@/data/chantiers';
import { getSummariesForOrg, type BudgetSummary } from '@/data/budget-engine';
import { useOrg } from '@/contexts/OrgContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatMAD, formatPercent } from '@/lib/format';

interface CombinedRow {
  chantier: Chantier;
  summary: BudgetSummary;
}

const STATUS_FILTERS: Array<{ value: 'all' | ChantierStatus; label: string }> = [
  { value: 'active', label: 'En cours' },
  { value: 'all', label: 'Tous' },
  { value: 'paused', label: 'En pause' },
  { value: 'completed', label: 'Terminés' },
];

export default function BudgetDashboardPage() {
  const { activeOrg } = useOrg();
  const [statusFilter, setStatusFilter] = useState<'all' | ChantierStatus>('active');

  const chantiers = useQuery({
    queryKey: ['chantiers', activeOrg?.id],
    queryFn: () => listChantiers(),
    enabled: !!activeOrg,
  });

  const summaries = useQuery({
    queryKey: ['budget-summaries', activeOrg?.id],
    queryFn: () => getSummariesForOrg(),
    enabled: !!activeOrg,
  });

  const rows: CombinedRow[] = useMemo(() => {
    const byId = new Map((summaries.data ?? []).map((s) => [s.chantier_id, s]));
    const cl = chantiers.data ?? [];
    return cl
      .filter((c) => statusFilter === 'all' || c.status === statusFilter)
      .map((c) => ({
        chantier: c,
        summary: byId.get(c.id) ?? {
          chantier_id: c.id,
          labor_spent: 0,
          materials_spent: 0,
          equipment_spent: 0,
          payments_received: 0,
          total_spent: 0,
          remaining: 0,
        },
      }));
  }, [chantiers.data, summaries.data, statusFilter]);

  if (chantiers.isLoading) {
    return <div className="text-sm text-bati-muted">Chargement…</div>;
  }

  if ((chantiers.data?.length ?? 0) === 0) {
    return (
      <EmptyState
        title="Aucun chantier"
        description="Créez un chantier pour voir un tableau de bord budgétaire."
        action={
          <Link
            to="/chantiers/new"
            className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium"
          >
            Créer un chantier
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-bati-text">Tableau de bord budgétaire</h1>
        <p className="text-sm text-bati-muted mt-0.5">
          Budget prévu vs réel par chantier — main d&apos;œuvre, matériaux, total.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              statusFilter === f.value
                ? 'bg-bati-teal text-white'
                : 'bg-bati-card border border-bati-border text-bati-muted hover:bg-bati-border-soft'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rows.length === 0 && (
        <EmptyState
          title="Aucun chantier ne correspond au filtre"
          description="Modifiez le filtre de statut pour voir plus de résultats."
        />
      )}

      <div className="space-y-4">
        {rows.map((r) => (
          <ChantierCard key={r.chantier.id} row={r} loading={summaries.isLoading} />
        ))}
      </div>
    </div>
  );
}

function ChantierCard({ row, loading }: { row: CombinedRow; loading: boolean }) {
  const { chantier: c, summary: s } = row;
  const laborPct = c.budget_labor > 0 ? s.labor_spent / c.budget_labor : 0;
  const materialsPct =
    c.budget_materials > 0 ? s.materials_spent / c.budget_materials : 0;
  const totalPct = c.budget_total > 0 ? s.total_spent / c.budget_total : 0;

  return (
    <div className="bati-card rounded-lg p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <div
            className="w-1.5 self-stretch min-h-[2rem] rounded-full"
            style={{ background: c.color ?? 'var(--bati-border)' }}
            aria-hidden
          />
          <div>
            <Link
              to={`/chantiers/${c.id}`}
              className="text-base font-bold text-bati-text hover:text-bati-teal hover:underline"
            >
              {c.name}
            </Link>
            <div className="mt-1 flex items-center gap-2 text-xs text-bati-muted">
              <StatusBadge status={c.status} />
              {c.client_name && <span>· {c.client_name}</span>}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-bati-muted">Total dépensé</div>
          <div className="text-lg font-bold text-bati-text tabular-nums">
            {formatMAD(s.total_spent)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <BudgetBar
          label="Main d'œuvre"
          spent={s.labor_spent}
          budget={c.budget_labor}
          pct={laborPct}
          drillTo={`/pointage`}
          loading={loading}
        />
        <BudgetBar
          label="Matériaux"
          spent={s.materials_spent}
          budget={c.budget_materials}
          pct={materialsPct}
          drillTo={`/consommables/consommation`}
          loading={loading}
        />
        <BudgetBar
          label="Total"
          spent={s.total_spent}
          budget={c.budget_total}
          pct={totalPct}
          drillTo={`/chantiers/${c.id}`}
          loading={loading}
          emphasis
        />
      </div>
    </div>
  );
}

interface BudgetBarProps {
  label: string;
  spent: number;
  budget: number;
  pct: number;
  drillTo: string;
  loading: boolean;
  emphasis?: boolean;
}

function BudgetBar({
  label,
  spent,
  budget,
  pct,
  drillTo,
  loading,
  emphasis = false,
}: BudgetBarProps) {
  const variance = budget - spent;
  // Color thresholds: green < 80%, ochre 80–100%, terra > 100%
  const barColor =
    pct > 1
      ? 'bg-bati-terra'
      : pct > 0.8
        ? 'bg-bati-ochre'
        : 'bg-bati-success';
  const textColor =
    pct > 1
      ? 'text-bati-terra'
      : pct > 0.8
        ? 'text-bati-ochre'
        : 'text-bati-success';
  const widthPct = Math.min(100, pct * 100);

  return (
    <Link
      to={drillTo}
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-bati-teal rounded-md"
    >
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
            {loading ? '…' : formatMAD(spent)} / {formatMAD(budget)}
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
      </div>
    </Link>
  );
}
