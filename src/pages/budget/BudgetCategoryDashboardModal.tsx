import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format, parseISO, startOfMonth } from 'date-fns';
import { Modal } from '@/components/ui/Modal';
import { useOrg } from '@/contexts/OrgContext';
import { formatMAD, formatPercent } from '@/lib/format';
import type { Chantier } from '@/data/chantiers';
import {
  getEquipmentBreakdown,
  getLaborBreakdown,
  getMaterialsBreakdown,
  type BudgetSummary,
  type DailyPoint,
  type EquipmentBreakdown,
  type LaborBreakdown,
  type MaterialsBreakdown,
} from '@/data/budget-engine';
import { StatCard } from './_shared';
import { CHART_COLOURS, pctAccent } from './_chart-utils';
import type { ChantierBudgetTab } from './ChantierBudgetView';

export type DashboardCategory = 'labor' | 'materials' | 'equipment' | 'total';

const TITLE: Record<DashboardCategory, string> = {
  labor: "Détail — Main d'œuvre",
  materials: 'Détail — Matériaux',
  equipment: 'Détail — Matériels',
  total: 'Détail — Total des coûts',
};

const TAB_BY_CATEGORY: Record<
  Exclude<DashboardCategory, 'total'>,
  { tab: ChantierBudgetTab; label: string }
> = {
  labor: { tab: 'pointage', label: 'Ouvrir le pointage' },
  materials: { tab: 'consommables', label: 'Ouvrir les consommables' },
  equipment: { tab: 'materiels', label: 'Ouvrir les matériels' },
};

export interface BudgetCategoryDashboardModalProps {
  category: DashboardCategory | null;
  chantier: Chantier;
  summary: BudgetSummary;
  onClose: () => void;
  onNavigateTab?: (tab: ChantierBudgetTab) => void;
}

export function BudgetCategoryDashboardModal({
  category,
  chantier,
  summary,
  onClose,
  onNavigateTab,
}: BudgetCategoryDashboardModalProps) {
  return (
    <Modal
      open={category !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={category ? TITLE[category] : ''}
      description={chantier.name}
      size="4xl"
    >
      <div className="max-h-[78vh] overflow-y-auto pr-1">
        {category === 'labor' && (
          <LaborDashboard chantier={chantier} summary={summary} />
        )}
        {category === 'materials' && (
          <MaterialsDashboard chantier={chantier} summary={summary} />
        )}
        {category === 'equipment' && (
          <EquipmentDashboard chantier={chantier} summary={summary} />
        )}
        {category === 'total' && (
          <TotalDashboard chantier={chantier} summary={summary} />
        )}

        {category && category !== 'total' && onNavigateTab && (
          <div className="mt-4 pt-3 border-t border-bati-border-soft text-right">
            <button
              type="button"
              onClick={() => {
                onNavigateTab(TAB_BY_CATEGORY[category].tab);
                onClose();
              }}
              className="text-xs font-medium text-bati-teal hover:underline"
            >
              {TAB_BY_CATEGORY[category].label} →
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Per-category dashboards ──────────────────────────────────────────────

interface DashboardProps {
  chantier: Chantier;
  summary: BudgetSummary;
}

function LaborDashboard({ chantier, summary }: DashboardProps) {
  const { activeOrg } = useOrg();
  const q = useQuery({
    queryKey: ['budget-breakdown', 'labor', activeOrg?.id, chantier.id],
    queryFn: () => getLaborBreakdown(chantier.id),
    enabled: !!activeOrg,
  });

  const data = q.data;
  const pct =
    chantier.budget_labor > 0 ? summary.labor_spent / chantier.budget_labor : 0;
  const variance = chantier.budget_labor - summary.labor_spent;
  const topWorkers = useMemo(
    () => (data ? data.byWorker.slice(0, 8) : []),
    [data]
  );

  return (
    <CategoryShell
      isLoading={q.isLoading}
      isError={q.isError}
      error={q.error}
      isEmpty={!!data && data.daily.length === 0 && data.byWorker.length === 0}
      emptyHint="Aucun pointage enregistré pour ce chantier."
    >
      <StatRow>
        <StatCard
          label="Dépensé"
          value={formatMAD(summary.labor_spent)}
          subtitle={
            chantier.budget_labor > 0
              ? `${formatPercent(pct)} du budget`
              : 'Pas de budget défini'
          }
          accent={chantier.budget_labor > 0 ? pctAccent(pct) : 'muted'}
        />
        <StatCard
          label="Budget"
          value={formatMAD(chantier.budget_labor)}
          subtitle={
            chantier.budget_labor > 0
              ? variance >= 0
                ? `Reste ${formatMAD(variance)}`
                : `Dépassement ${formatMAD(-variance)}`
              : undefined
          }
          accent={variance >= 0 ? 'muted' : 'terra'}
        />
        <StatCard
          label="Jours travaillés"
          value={data ? String(data.totalDaysWorked) : '—'}
          subtitle={
            data && data.totalPrimes > 0
              ? `+ ${formatMAD(data.totalPrimes)} de primes`
              : 'Aucune prime'
          }
          accent="teal"
        />
      </StatRow>

      {data && data.daily.length > 0 && (
        <ChartCard title="Coût journalier (présences + primes)">
          <DailyLineChart points={data.daily} colour={CHART_COLOURS.teal} />
        </ChartCard>
      )}

      {topWorkers.length > 0 && (
        <ChartCard title="Coût par ouvrier">
          <TopBarChart
            rows={topWorkers.map((w) => ({ label: w.name, value: w.amount }))}
            colour={CHART_COLOURS.teal}
          />
        </ChartCard>
      )}
    </CategoryShell>
  );
}

function MaterialsDashboard({ chantier, summary }: DashboardProps) {
  const { activeOrg } = useOrg();
  const q = useQuery({
    queryKey: ['budget-breakdown', 'materials', activeOrg?.id, chantier.id],
    queryFn: () => getMaterialsBreakdown(chantier.id),
    enabled: !!activeOrg,
  });

  const data = q.data;
  const pct =
    chantier.budget_materials > 0
      ? summary.materials_spent / chantier.budget_materials
      : 0;
  const variance = chantier.budget_materials - summary.materials_spent;
  const cumulative = useMemo(
    () => (data ? toCumulative(data.daily) : []),
    [data]
  );
  const topItems = useMemo(() => (data ? data.byItem.slice(0, 8) : []), [data]);

  return (
    <CategoryShell
      isLoading={q.isLoading}
      isError={q.isError}
      error={q.error}
      isEmpty={!!data && data.events === 0}
      emptyHint="Aucune sortie de stock enregistrée sur ce chantier."
    >
      <StatRow>
        <StatCard
          label="Dépensé"
          value={formatMAD(summary.materials_spent)}
          subtitle={
            chantier.budget_materials > 0
              ? `${formatPercent(pct)} du budget`
              : 'Pas de budget défini'
          }
          accent={chantier.budget_materials > 0 ? pctAccent(pct) : 'muted'}
        />
        <StatCard
          label="Budget"
          value={formatMAD(chantier.budget_materials)}
          subtitle={
            chantier.budget_materials > 0
              ? variance >= 0
                ? `Reste ${formatMAD(variance)}`
                : `Dépassement ${formatMAD(-variance)}`
              : undefined
          }
          accent={variance >= 0 ? 'muted' : 'terra'}
        />
        <StatCard
          label="Articles distincts"
          value={data ? String(data.distinctItems) : '—'}
          subtitle={data ? `${data.events} sortie${data.events > 1 ? 's' : ''}` : undefined}
          accent="teal"
        />
      </StatRow>

      {cumulative.length > 0 && (
        <ChartCard title="Consommation cumulée">
          <DailyLineChart points={cumulative} colour={CHART_COLOURS.ochre} />
        </ChartCard>
      )}

      {topItems.length > 0 && (
        <ChartCard title="Articles les plus consommés (par coût)">
          <TopBarChart
            rows={topItems.map((i) => ({
              label: i.name,
              value: i.amount,
              hint: `${i.qty} ${i.qty > 1 ? 'unités' : 'unité'}`,
            }))}
            colour={CHART_COLOURS.ochre}
          />
        </ChartCard>
      )}
    </CategoryShell>
  );
}

function EquipmentDashboard({ chantier, summary }: DashboardProps) {
  const { activeOrg } = useOrg();
  const q = useQuery({
    queryKey: ['budget-breakdown', 'equipment', activeOrg?.id, chantier.id],
    queryFn: () => getEquipmentBreakdown(chantier.id),
    enabled: !!activeOrg,
  });

  const data = q.data;
  const pct =
    chantier.budget_equipment > 0
      ? summary.equipment_spent / chantier.budget_equipment
      : 0;
  const variance = chantier.budget_equipment - summary.equipment_spent;
  const topMateriels = useMemo(
    () => (data ? data.byMateriel.slice(0, 8) : []),
    [data]
  );
  const pieData = useMemo(
    () =>
      (data?.byType ?? []).filter((d) => d.amount > 0).map((d) => ({
        name: d.type === 'possede' ? 'Possédé' : 'Loué',
        value: d.amount,
      })),
    [data]
  );

  return (
    <CategoryShell
      isLoading={q.isLoading}
      isError={q.isError}
      error={q.error}
      isEmpty={!!data && data.deployments.length === 0}
      emptyHint="Aucun matériel n'a encore été déployé sur ce chantier."
    >
      <StatRow>
        <StatCard
          label="Dépensé"
          value={formatMAD(summary.equipment_spent)}
          subtitle={
            chantier.budget_equipment > 0
              ? `${formatPercent(pct)} du budget`
              : 'Pas de budget défini'
          }
          accent={chantier.budget_equipment > 0 ? pctAccent(pct) : 'muted'}
        />
        <StatCard
          label="Budget"
          value={formatMAD(chantier.budget_equipment)}
          subtitle={
            chantier.budget_equipment > 0
              ? variance >= 0
                ? `Reste ${formatMAD(variance)}`
                : `Dépassement ${formatMAD(-variance)}`
              : undefined
          }
          accent={variance >= 0 ? 'muted' : 'terra'}
        />
        <StatCard
          label="Matériels mobilisés"
          value={data ? String(data.distinctMateriels) : '—'}
          subtitle={
            data
              ? `${data.deployments.length} déploiement${data.deployments.length > 1 ? 's' : ''}`
              : undefined
          }
          accent="teal"
        />
      </StatRow>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {topMateriels.length > 0 && (
          <ChartCard title="Coût par matériel">
            <TopBarChart
              rows={topMateriels.map((m) => ({
                label: m.name,
                value: m.amount,
                hint: `${m.days} jour${m.days > 1 ? 's' : ''}`,
              }))}
              colour={CHART_COLOURS.teal}
            />
          </ChartCard>
        )}

        {pieData.length > 0 && (
          <ChartCard title="Possédé vs loué">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {pieData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={i === 0 ? CHART_COLOURS.success : CHART_COLOURS.ochre}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => formatMAD(typeof v === 'number' ? v : 0)}
                    contentStyle={tooltipStyle}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        )}
      </div>

      {data && data.deployments.length > 0 && (
        <ChartCard title="Déploiements (durée × coût)">
          <DeploymentsList deployments={data.deployments} />
        </ChartCard>
      )}
    </CategoryShell>
  );
}

function TotalDashboard({ chantier, summary }: DashboardProps) {
  const { activeOrg } = useOrg();
  const queryEnabled = !!activeOrg;

  const labor = useQuery({
    queryKey: ['budget-breakdown', 'labor', activeOrg?.id, chantier.id],
    queryFn: () => getLaborBreakdown(chantier.id),
    enabled: queryEnabled,
  });
  const materials = useQuery({
    queryKey: ['budget-breakdown', 'materials', activeOrg?.id, chantier.id],
    queryFn: () => getMaterialsBreakdown(chantier.id),
    enabled: queryEnabled,
  });
  const equipment = useQuery({
    queryKey: ['budget-breakdown', 'equipment', activeOrg?.id, chantier.id],
    queryFn: () => getEquipmentBreakdown(chantier.id),
    enabled: queryEnabled,
  });

  const isLoading = labor.isLoading || materials.isLoading || equipment.isLoading;
  const isError = labor.isError || materials.isError || equipment.isError;
  const error = labor.error ?? materials.error ?? equipment.error;

  const compositionPie = useMemo(() => {
    const out = [
      { name: "Main d'œuvre", value: summary.labor_spent, colour: CHART_COLOURS.teal },
      { name: 'Matériaux', value: summary.materials_spent, colour: CHART_COLOURS.ochre },
      { name: 'Matériels', value: summary.equipment_spent, colour: CHART_COLOURS.terra },
    ];
    return out.filter((d) => d.value > 0);
  }, [summary]);

  const monthlyBurn = useMemo(() => {
    if (!labor.data || !materials.data || !equipment.data) return [];
    return buildMonthlyBurn(labor.data, materials.data, equipment.data);
  }, [labor.data, materials.data, equipment.data]);

  const pct =
    chantier.budget_total > 0 ? summary.total_spent / chantier.budget_total : 0;
  const variance = chantier.budget_total - summary.total_spent;
  const billedPct =
    chantier.contract_value > 0 ? summary.payments_received / chantier.contract_value : 0;
  const cashPosition = summary.payments_received - summary.total_spent;

  return (
    <CategoryShell
      isLoading={isLoading}
      isError={isError}
      error={error}
      isEmpty={summary.total_spent === 0}
      emptyHint="Aucun coût enregistré sur ce chantier."
    >
      <StatRow>
        <StatCard
          label="Total dépensé"
          value={formatMAD(summary.total_spent)}
          subtitle={
            chantier.budget_total > 0
              ? `${formatPercent(pct)} du budget`
              : 'Pas de budget défini'
          }
          accent={chantier.budget_total > 0 ? pctAccent(pct) : 'muted'}
        />
        <StatCard
          label="Paiements reçus"
          value={formatMAD(summary.payments_received)}
          subtitle={
            chantier.contract_value > 0
              ? `${formatPercent(billedPct)} du contrat`
              : undefined
          }
          accent="teal"
        />
        <StatCard
          label={cashPosition >= 0 ? 'Trésorerie positive' : 'Trésorerie négative'}
          value={`${cashPosition >= 0 ? '+' : '−'} ${formatMAD(Math.abs(cashPosition))}`}
          subtitle={
            variance >= 0
              ? `Budget restant ${formatMAD(variance)}`
              : `Dépassement ${formatMAD(-variance)}`
          }
          accent={cashPosition >= 0 ? 'success' : 'terra'}
        />
      </StatRow>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {compositionPie.length > 0 && (
          <ChartCard title="Répartition des coûts">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={compositionPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {compositionPie.map((entry, i) => (
                      <Cell key={i} fill={entry.colour} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => formatMAD(typeof v === 'number' ? v : 0)}
                    contentStyle={tooltipStyle}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        )}

        <ChartCard title="Coûts vs paiements">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  { name: 'Coûts engagés', value: summary.total_spent },
                  { name: 'Paiements reçus', value: summary.payments_received },
                  { name: 'Valeur contrat', value: chantier.contract_value },
                ]}
                layout="vertical"
                margin={{ top: 10, right: 30, left: 30, bottom: 10 }}
              >
                <CartesianGrid stroke={CHART_COLOURS.softBorder} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tickFormatter={(v) => compactMAD(v)}
                  tick={axisTick}
                />
                <YAxis dataKey="name" type="category" width={110} tick={axisTick} />
                <Tooltip
                  formatter={(v) => formatMAD(typeof v === 'number' ? v : 0)}
                  contentStyle={tooltipStyle}
                />
                <Bar dataKey="value" fill={CHART_COLOURS.teal} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {monthlyBurn.length > 0 && (
        <ChartCard title="Coût mensuel par catégorie">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthlyBurn}
                margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
              >
                <CartesianGrid stroke={CHART_COLOURS.softBorder} strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={axisTick} />
                <YAxis tickFormatter={compactMAD} tick={axisTick} />
                <Tooltip
                  formatter={(v) => formatMAD(typeof v === 'number' ? v : 0)}
                  contentStyle={tooltipStyle}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="labor" stackId="a" name="Main d'œuvre" fill={CHART_COLOURS.teal} />
                <Bar dataKey="materials" stackId="a" name="Matériaux" fill={CHART_COLOURS.ochre} />
                <Bar dataKey="equipment" stackId="a" name="Matériels" fill={CHART_COLOURS.terra} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      )}
    </CategoryShell>
  );
}

// ── Shared mini-chart primitives ─────────────────────────────────────────

const axisTick = { fontSize: 11, fill: CHART_COLOURS.muted } as const;
const tooltipStyle = {
  background: '#fff',
  border: `1px solid ${CHART_COLOURS.softBorder}`,
  borderRadius: 6,
  fontSize: 12,
} as const;

function StatRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">{children}</div>;
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bati-card rounded-lg p-4 mb-3">
      <div className="text-xs uppercase tracking-wide text-bati-muted mb-2">{title}</div>
      {children}
    </div>
  );
}

interface CategoryShellProps {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyHint: string;
  children: React.ReactNode;
}

function CategoryShell({
  isLoading,
  isError,
  error,
  isEmpty,
  emptyHint,
  children,
}: CategoryShellProps) {
  if (isLoading) {
    return (
      <div className="text-sm text-bati-muted py-8 text-center">Chargement…</div>
    );
  }
  if (isError) {
    const msg = error instanceof Error ? error.message : 'Erreur de chargement';
    return (
      <div className="bati-card rounded-lg p-4 text-sm text-bati-terra">{msg}</div>
    );
  }
  if (isEmpty) {
    return (
      <div className="bati-card rounded-lg p-6 text-sm text-bati-muted text-center">
        {emptyHint}
      </div>
    );
  }
  return <>{children}</>;
}

function DailyLineChart({
  points,
  colour,
}: {
  points: DailyPoint[];
  colour: string;
}) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={points.map((p) => ({ ...p, label: format(parseISO(p.date), 'dd/MM') }))}
          margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
        >
          <CartesianGrid stroke={CHART_COLOURS.softBorder} strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={axisTick} />
          <YAxis tickFormatter={compactMAD} tick={axisTick} />
          <Tooltip
            formatter={(v) => formatMAD(typeof v === 'number' ? v : 0)}
            contentStyle={tooltipStyle}
            labelFormatter={(label) => `Date : ${label}`}
          />
          <Line
            type="monotone"
            dataKey="amount"
            stroke={colour}
            strokeWidth={2}
            dot={{ r: 2, fill: colour }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TopBarChart({
  rows,
  colour,
}: {
  rows: { label: string; value: number; hint?: string }[];
  colour: string;
}) {
  const data = rows.map((r) => ({ ...r, displayLabel: truncate(r.label, 28) }));
  const height = Math.max(180, rows.length * 32 + 40);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 20, left: 10, bottom: 4 }}
        >
          <CartesianGrid stroke={CHART_COLOURS.softBorder} strokeDasharray="3 3" />
          <XAxis type="number" tickFormatter={compactMAD} tick={axisTick} />
          <YAxis
            dataKey="displayLabel"
            type="category"
            width={150}
            tick={axisTick}
            interval={0}
          />
          <Tooltip
            formatter={(v, _name, item) => {
              const amount = typeof v === 'number' ? v : 0;
              const hint = (item?.payload as { hint?: string } | undefined)?.hint;
              return hint
                ? [`${formatMAD(amount)} · ${hint}`, '']
                : [formatMAD(amount), ''];
            }}
            contentStyle={tooltipStyle}
          />
          <Bar dataKey="value" fill={colour} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DeploymentsList({
  deployments,
}: {
  deployments: EquipmentBreakdown['deployments'];
}) {
  const max = Math.max(...deployments.map((d) => d.amount), 1);
  return (
    <div className="space-y-1.5">
      {deployments.map((d, i) => {
        const days = daysBetween(d.start, d.end);
        const width = Math.max(4, (d.amount / max) * 100);
        return (
          <div key={`${d.materiel_id}-${i}`} className="text-xs">
            <div className="flex items-baseline justify-between mb-0.5">
              <span className="font-medium text-bati-text truncate" title={d.name}>
                {d.name}
              </span>
              <span className="tabular-nums text-bati-muted">
                {formatMAD(d.amount)}
                <span className="ml-1 text-[10px]">
                  · {format(parseISO(d.start), 'dd/MM')} → {format(parseISO(d.end), 'dd/MM')} ·{' '}
                  {days} j
                </span>
              </span>
            </div>
            <div className="h-1.5 bg-bati-border-soft rounded-full overflow-hidden">
              <div
                className="h-full bg-bati-teal"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function toCumulative(points: DailyPoint[]): DailyPoint[] {
  let running = 0;
  return points.map((p) => {
    running += p.amount;
    return { date: p.date, amount: Math.round(running * 100) / 100 };
  });
}

interface MonthBucket {
  labor: number;
  materials: number;
  equipment: number;
}

function buildMonthlyBurn(
  labor: LaborBreakdown,
  materials: MaterialsBreakdown,
  equipment: EquipmentBreakdown
): ({ month: string } & MonthBucket)[] {
  const buckets = new Map<string, MonthBucket>();

  function bump(key: keyof MonthBucket, date: string, amount: number) {
    const monthKey = format(startOfMonth(parseISO(date)), 'yyyy-MM');
    const b = buckets.get(monthKey) ?? { labor: 0, materials: 0, equipment: 0 };
    b[key] += amount;
    buckets.set(monthKey, b);
  }

  for (const p of labor.daily) bump('labor', p.date, p.amount);
  for (const p of materials.daily) bump('materials', p.date, p.amount);
  // Equipment is paid over a date range — distribute evenly across the deployment span.
  for (const d of equipment.deployments) {
    const days = daysBetween(d.start, d.end);
    if (days <= 0) continue;
    const perDay = d.amount / days;
    let cursor = parseISO(d.start);
    const end = parseISO(d.end);
    while (cursor <= end) {
      bump('equipment', format(cursor, 'yyyy-MM-dd'), perDay);
      cursor = new Date(cursor.getTime() + 86_400_000);
    }
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month: format(parseISO(`${month}-01`), 'MMM yy'),
      labor: Math.round(v.labor * 100) / 100,
      materials: Math.round(v.materials * 100) / 100,
      equipment: Math.round(v.equipment * 100) / 100,
    }));
}

function daysBetween(startIso: string, endIso: string): number {
  const ms = parseISO(endIso).getTime() - parseISO(startIso).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

function compactMAD(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} M`;
  if (abs >= 1_000) return `${Math.round(v / 1_000)} k`;
  return String(Math.round(v));
}
