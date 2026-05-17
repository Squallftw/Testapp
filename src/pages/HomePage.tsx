import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format, parseISO, subDays } from 'date-fns';
import { useOrg } from '@/contexts/OrgContext';
import { listChantiers, type Chantier } from '@/data/chantiers';
import { listAttendance, type Attendance } from '@/data/attendance';
import { listWorkers, type Worker } from '@/data/workers';
import { listItems, listStockOnHand } from '@/data/consumables';
import { getSummariesForOrg, type BudgetSummary } from '@/data/budget-engine';
import { listTasksForChantier, type TaskWithAssignments } from '@/data/tasks';
import { clearDemoData, hasDemoData, seedDemoData } from '@/data/seed-demo';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/components/ui/Toast';
import { ChantierScoreCard } from '@/components/dashboard/ChantierScoreCard';
import { DashboardKpiStrip } from '@/components/dashboard/DashboardKpiStrip';
import { PausedChantiersStrip } from '@/components/dashboard/PausedChantiersStrip';
import {
  ActiveChantiersDetail,
  AlertsDetail,
  CashPositionDetail,
  KpiDetailPanel,
  PresentTodayDetail,
  type KpiKey,
  type LowStockItem,
  type OverBudgetItem,
  type OverdueTaskItem,
} from '@/components/dashboard/KpiDetailPanels';

const WINDOW_DAYS = 14;

export default function HomePage() {
  const { activeOrg } = useOrg();
  const today = format(new Date(), 'yyyy-MM-dd');
  const windowStart = format(subDays(new Date(), WINDOW_DAYS - 1), 'yyyy-MM-dd');
  const [expandedKpi, setExpandedKpi] = useState<KpiKey | null>(null);

  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < WINDOW_DAYS; i++) {
      out.push(format(addDays(parseISO(windowStart), i), 'yyyy-MM-dd'));
    }
    return out;
  }, [windowStart]);

  const [chantiersQ, summariesQ, attendanceQ, workersQ, stockQ, itemsQ] =
    useQueries({
      queries: [
        {
          queryKey: ['chantiers', activeOrg?.id],
          queryFn: () => listChantiers(),
          enabled: !!activeOrg,
        },
        {
          queryKey: ['budget-summaries', activeOrg?.id],
          queryFn: () => getSummariesForOrg(),
          enabled: !!activeOrg,
        },
        {
          queryKey: ['attendance', activeOrg?.id, 'window', windowStart, today],
          queryFn: () =>
            listAttendance({ dateRange: { start: windowStart, end: today } }),
          enabled: !!activeOrg,
        },
        {
          queryKey: ['workers', activeOrg?.id],
          queryFn: () => listWorkers(),
          enabled: !!activeOrg,
        },
        {
          queryKey: ['stock-on-hand', activeOrg?.id],
          queryFn: () => listStockOnHand(),
          enabled: !!activeOrg,
        },
        {
          queryKey: ['consumables-items', activeOrg?.id],
          queryFn: () => listItems(),
          enabled: !!activeOrg,
        },
      ],
    });

  const chantiers = useMemo(
    () => chantiersQ.data ?? [],
    [chantiersQ.data]
  );
  const activeChantiers = useMemo(
    () => chantiers.filter((c) => c.status === 'active'),
    [chantiers]
  );
  const inactiveChantiers = useMemo(
    () => chantiers.filter((c) => c.status !== 'active'),
    [chantiers]
  );

  // Fan out one query per active chantier for its tasks. Cache key matches
  // the Planning tab so navigating reuses these.
  const taskQueries = useQueries({
    queries: activeChantiers.map((c) => ({
      queryKey: ['tasks', c.id],
      queryFn: () => listTasksForChantier(c.id),
      enabled: !!activeOrg,
    })),
  });

  const summariesById = useMemo(
    () => new Map((summariesQ.data ?? []).map((s) => [s.chantier_id, s])),
    [summariesQ.data]
  );

  const perChantier = useMemo(
    () =>
      aggregatePerChantier(
        attendanceQ.data ?? [],
        workersQ.data ?? [],
        days,
        today
      ),
    [attendanceQ.data, workersQ.data, days, today]
  );

  const lowStockList = useMemo<LowStockItem[]>(() => {
    const items = itemsQ.data ?? [];
    const stockById = new Map(
      (stockQ.data ?? []).map((s) => [s.item_id, Number(s.on_hand) || 0])
    );
    return items.flatMap((it) => {
      if (it.reorder_threshold == null) return [];
      const onHand = stockById.get(it.id) ?? 0;
      const threshold = Number(it.reorder_threshold);
      if (onHand >= threshold) return [];
      return [{ item: it, onHand, threshold }];
    });
  }, [itemsQ.data, stockQ.data]);

  const overBudgetList = useMemo<OverBudgetItem[]>(
    () =>
      activeChantiers.flatMap((c) => {
        const s = summariesById.get(c.id);
        if (!s || c.budget_total <= 0) return [];
        if (s.total_spent <= c.budget_total) return [];
        return [{ chantier: c, spent: s.total_spent, over: s.total_spent - c.budget_total }];
      }),
    [activeChantiers, summariesById]
  );

  const overdueTasksList = useMemo<OverdueTaskItem[]>(() => {
    const chantierById = new Map(activeChantiers.map((c) => [c.id, c]));
    const todayParsed = parseISO(today);
    const out: OverdueTaskItem[] = [];
    for (const q of taskQueries) {
      for (const t of q.data ?? []) {
        if (t.status === 'done') continue;
        if (!t.start_date || t.duration_days == null) continue;
        const end = addDays(parseISO(t.start_date), t.duration_days);
        const endIso = format(end, 'yyyy-MM-dd');
        if (endIso >= today) continue;
        const chantier = chantierById.get(t.chantier_id);
        if (!chantier) continue;
        const daysOverdue = Math.max(
          1,
          Math.round((todayParsed.getTime() - end.getTime()) / 86_400_000)
        );
        out.push({ task: t, chantier, endIso, daysOverdue });
      }
    }
    return out.sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [taskQueries, activeChantiers, today]);

  const lowStockCount = lowStockList.length;
  const overBudgetCount = overBudgetList.length;
  const overdueTasksCount = overdueTasksList.length;

  const presentByChantier = useMemo(() => {
    const m = new Map<string, number>();
    for (const [id, agg] of perChantier) {
      m.set(id, agg.presentToday);
    }
    return m;
  }, [perChantier]);

  const totalPresentToday = useMemo(() => {
    let count = 0;
    for (const c of activeChantiers) {
      count += perChantier.get(c.id)?.presentToday ?? 0;
    }
    return count;
  }, [activeChantiers, perChantier]);

  const totalCashPosition = useMemo(() => {
    let cash = 0;
    for (const c of activeChantiers) {
      const s = summariesById.get(c.id);
      if (!s) continue;
      cash += s.payments_received - s.total_spent;
    }
    return cash;
  }, [activeChantiers, summariesById]);

  const isLoading =
    chantiersQ.isLoading ||
    summariesQ.isLoading ||
    attendanceQ.isLoading ||
    workersQ.isLoading;

  // First-run / empty-org state
  const isEmptyOrg = !isLoading && chantiers.length === 0;

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-bati-text">
          {activeOrg ? `Bonjour — ${activeOrg.name}` : 'Tableau de bord'}
        </h1>
        <p className="text-sm text-bati-muted mt-1">
          Vue d&apos;ensemble de votre activité chantier.
        </p>
      </div>

      {isEmptyOrg ? (
        <EmptyState
          title="Aucun chantier encore"
          description="Créez votre premier chantier pour voir le tableau de bord prendre vie."
          action={
            <Link
              to="/chantiers/new"
              className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium hover:opacity-90"
            >
              Créer un chantier
            </Link>
          }
        />
      ) : (
        <>
          <DashboardKpiStrip
            activeChantiersCount={activeChantiers.length}
            presentToday={totalPresentToday}
            alertsCount={overBudgetCount + lowStockCount + overdueTasksCount}
            cashPosition={totalCashPosition}
            isLoading={isLoading}
            expandedKey={expandedKpi}
            onToggle={(key) =>
              setExpandedKpi((current) => (current === key ? null : key))
            }
          />

          {expandedKpi === 'active' && (
            <KpiDetailPanel
              title={`Chantiers actifs (${activeChantiers.length})`}
              onClose={() => setExpandedKpi(null)}
            >
              <ActiveChantiersDetail
                chantiers={activeChantiers}
                summariesById={summariesById}
              />
            </KpiDetailPanel>
          )}
          {expandedKpi === 'present' && (
            <KpiDetailPanel
              title={`Présents aujourd'hui (${totalPresentToday})`}
              onClose={() => setExpandedKpi(null)}
            >
              <PresentTodayDetail
                chantiers={activeChantiers}
                presentByChantier={presentByChantier}
              />
            </KpiDetailPanel>
          )}
          {expandedKpi === 'alerts' && (
            <KpiDetailPanel
              title={`Alertes ouvertes (${overBudgetCount + lowStockCount + overdueTasksCount})`}
              onClose={() => setExpandedKpi(null)}
            >
              <AlertsDetail
                overBudget={overBudgetList}
                lowStock={lowStockList}
                overdueTasks={overdueTasksList}
              />
            </KpiDetailPanel>
          )}
          {expandedKpi === 'cash' && (
            <KpiDetailPanel
              title="Position de trésorerie par chantier"
              onClose={() => setExpandedKpi(null)}
            >
              <CashPositionDetail
                chantiers={chantiers}
                summariesById={summariesById}
              />
            </KpiDetailPanel>
          )}

          {activeChantiers.length === 0 ? (
            <EmptyState
              title="Aucun chantier actif"
              description="Réactivez un chantier en pause ou créez-en un nouveau."
              action={
                <Link
                  to="/chantiers/new"
                  className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium hover:opacity-90"
                >
                  Créer un chantier
                </Link>
              }
            />
          ) : (
            <div className="space-y-4">
              {activeChantiers.map((c, idx) => {
                const summary = summariesById.get(c.id) ?? blankSummary(c.id);
                const agg = perChantier.get(c.id);
                const tq = taskQueries[idx];
                const tasks = computeTaskStats(tq?.data ?? []);
                return (
                  <ChantierScoreCard
                    key={c.id}
                    chantier={c}
                    summary={summary}
                    laborTimeSeries={agg?.laborSeries ?? []}
                    presentToday={agg?.presentToday ?? 0}
                    tasks={tasks}
                  />
                );
              })}
            </div>
          )}

          <PausedChantiersStrip
            chantiers={inactiveChantiers}
            summariesById={summariesById}
          />
        </>
      )}

      {DEMO_CARD_ENABLED && activeOrg && <DemoDataCard />}
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────

function blankSummary(chantierId: string): BudgetSummary {
  return {
    chantier_id: chantierId,
    labor_spent: 0,
    materials_spent: 0,
    equipment_spent: 0,
    payments_received: 0,
    total_spent: 0,
    remaining: 0,
  };
}

function computeTaskStats(tasks: TaskWithAssignments[]): {
  done: number;
  total: number;
} {
  let done = 0;
  for (const t of tasks) {
    if (t.status === 'done') done++;
  }
  return { done, total: tasks.length };
}

interface ChantierAgg {
  laborSeries: number[];
  presentToday: number;
}

function aggregatePerChantier(
  attendance: Attendance[],
  workers: Worker[],
  days: string[],
  today: string
): Map<string, ChantierAgg> {
  const rateByWorker = new Map(
    workers.map((w) => [w.id, Number(w.daily_rate) || 0])
  );
  // (chantierId → date → labor cost for that day)
  const labor = new Map<string, Map<string, number>>();
  // (chantierId → count of present rows today)
  const today_present = new Map<string, number>();

  for (const a of attendance) {
    let perChantier = labor.get(a.chantier_id);
    if (!perChantier) {
      perChantier = new Map();
      labor.set(a.chantier_id, perChantier);
    }
    let dayCost = perChantier.get(a.attendance_date) ?? 0;
    if (a.status === 'P') {
      dayCost += rateByWorker.get(a.worker_id) ?? 0;
    }
    dayCost += Number(a.prime_amount) || 0;
    perChantier.set(a.attendance_date, dayCost);

    if (a.attendance_date === today && a.status === 'P') {
      today_present.set(a.chantier_id, (today_present.get(a.chantier_id) ?? 0) + 1);
    }
  }

  const out = new Map<string, ChantierAgg>();
  const chantierIds = new Set<string>([
    ...labor.keys(),
    ...today_present.keys(),
  ]);
  for (const id of chantierIds) {
    const perDay = labor.get(id);
    const series = days.map((d) => perDay?.get(d) ?? 0);
    out.set(id, {
      laborSeries: series,
      presentToday: today_present.get(id) ?? 0,
    });
  }
  return out;
}

// ─── Demo data card ────────────────────────────────────────────────────
//
// Shown in dev (always) and on deployments that opt in via
// VITE_ENABLE_DEMO=true (set in .github/workflows/deploy.yml for the GH
// Pages preview build so visitors can populate their own org). RLS isolates
// the writes per-org, and `clearDemoData()` only touches rows tagged with
// the `Démo · ` name prefix — so toggling the card never affects real data.
const DEMO_CARD_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === 'true';

const DEMO_INVALIDATION_KEYS = [
  ['chantiers'],
  ['workers'],
  ['suppliers'],
  ['items'],
  ['purchases'],
  ['consumption'],
  ['attendance'],
  ['budget-summaries'],
  ['stock-on-hand'],
  ['tasks'],
  ['consumables-items'],
  ['payments'],
];

function DemoDataCard() {
  const queryClient = useQueryClient();
  const [confirmingClear, setConfirmingClear] = useState(false);

  const present = useQuery({
    queryKey: ['demo-data-present'],
    queryFn: () => hasDemoData(),
  });

  const seed = useMutation({
    mutationFn: () => seedDemoData(),
    onSuccess: async (counts) => {
      toast.success(
        `Démo chargée — ${counts.chantiers} chantiers · ${counts.workers} ouvriers · ${counts.purchases} achats · ${counts.attendance} pointages · ${counts.tasks} tâches · ${counts.payments} paiements`
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['demo-data-present'] }),
        ...DEMO_INVALIDATION_KEYS.map((key) =>
          queryClient.invalidateQueries({ queryKey: key })
        ),
      ]);
    },
    onError: (err) => toast.fromError(err, 'Échec du chargement de la démo'),
  });

  const clear = useMutation({
    mutationFn: () => clearDemoData(),
    onSuccess: async ({ deleted }) => {
      toast.success(`Données de démo effacées (${deleted} enregistrements)`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['demo-data-present'] }),
        ...DEMO_INVALIDATION_KEYS.map((key) =>
          queryClient.invalidateQueries({ queryKey: key })
        ),
      ]);
    },
    onError: (err) => toast.fromError(err, "Échec de l'effacement"),
  });

  const isPresent = present.data === true;
  const isBusy = seed.isPending || clear.isPending;

  return (
    <div className="bati-card rounded-lg p-5 border-dashed">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-wide text-bati-muted">
            {import.meta.env.DEV ? 'Mode développement' : 'Mode démo'}
          </div>
          <h2 className="text-base font-bold text-bati-text mt-0.5">
            Données de démo
          </h2>
          <p className="text-xs text-bati-muted mt-1 max-w-xl leading-relaxed">
            Crée 2 chantiers (un terminé en dépassement, un en cours sain), 6 ouvriers,
            2 fournisseurs, 8 articles, 4 achats et plusieurs semaines de pointage et
            de consommation. Idéal pour vérifier que chaque écran affiche des chiffres
            cohérents.
          </p>
          <p className="text-xs text-bati-muted mt-1">
            État&nbsp;:{' '}
            {present.isLoading ? (
              <span>vérification…</span>
            ) : isPresent ? (
              <span className="text-bati-success font-medium">Démo chargée</span>
            ) : (
              <span>Aucune donnée de démo</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => seed.mutate()}
            disabled={isBusy || isPresent || present.isLoading}
            className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-40"
          >
            {seed.isPending ? 'Chargement…' : 'Charger les données de démo'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmingClear(true)}
            disabled={isBusy || !isPresent}
            className="px-4 py-2 border border-bati-terra text-bati-terra rounded-md text-sm font-medium hover:bg-bati-terra hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-bati-terra transition-colors"
          >
            Effacer les données de démo
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmingClear}
        onOpenChange={(o) => !o && setConfirmingClear(false)}
        title="Effacer les données de démo ?"
        description={
          <span>
            Tous les chantiers, ouvriers, fournisseurs, articles, achats, pointages et
            consommations préfixés «&nbsp;Démo&nbsp;·&nbsp;» seront supprimés. Vos vraies
            données ne sont pas touchées.
          </span>
        }
        confirmLabel="Effacer"
        destructive
        onConfirm={async () => {
          await clear.mutateAsync();
        }}
      />
    </div>
  );
}
// Surface `Chantier` for type narrowing in tooling.
export type { Chantier };
