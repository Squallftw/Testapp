/**
 * Foresight DAL — fetches all inputs needed by the foresight engine
 * (src/lib/foresight) in as few round-trips as possible, then exposes them
 * via React Query hooks for the cockpit and per-chantier surfaces.
 *
 * Both useOrgForesight and useChantierForesight share the same underlying
 * inputs query so navigating between HomePage and a chantier reuses the cache.
 */
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useOrg } from '@/contexts/OrgContext';
import { getActiveOrgId, getSupabase } from './client';
import { listChantiers } from './chantiers';
import { getSummariesForOrg } from './budget-engine';
import { listItems, listStockOnHand } from './consumables';
import {
  computeChantierForesight,
  computeOrgForesight,
  type ChantierForesight,
  type ChantierForesightInput,
  type OrgForesight,
  type ScheduleTaskInput,
} from '@/lib/foresight';

// ── raw fetchers ───────────────────────────────────────────────────────

interface AlertRow {
  chantier_id: string | null;
  severity: 'critical' | 'warning' | 'info';
}

/**
 * Fetch active alerts from the watchdog table. Optional signal — alerts feed
 * the risk score's "active alerts" drivers but are not required for cost or
 * schedule projections to work. Any failure (missing table, RLS denial,
 * network) falls back to an empty list so the rest of the foresight pipeline
 * continues to render. Logs once so the issue is visible in the console.
 */
async function fetchActiveAlerts(orgId: string): Promise<AlertRow[]> {
  const supabase = getSupabase();
  try {
    const { data, error } = await supabase
      .from('alerts')
      .select('chantier_id, severity')
      .eq('org_id', orgId)
      .eq('state', 'active');
    if (error) {
      console.warn('[foresight] alerts query skipped:', error);
      return [];
    }
    return (data ?? []) as unknown as AlertRow[];
  } catch (e) {
    console.warn('[foresight] alerts query threw:', e);
    return [];
  }
}

interface OrgTaskRow {
  chantier_id: string;
  status: 'todo' | 'ongoing' | 'done' | 'critical';
  duration_days: number | null;
}

/**
 * Single batched query for all tasks in the org — avoids the N+1 pattern of
 * fanning out listTasksForChantier per chantier. Fails soft on any error so
 * a tasks problem doesn't block cost projection (which has no task dependency).
 */
async function fetchOrgTasks(orgId: string): Promise<OrgTaskRow[]> {
  const supabase = getSupabase();
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('chantier_id, status, duration_days')
      .eq('org_id', orgId)
      .is('deleted_at', null);
    if (error) {
      console.warn('[foresight] tasks query skipped:', error);
      return [];
    }
    return (data ?? []) as unknown as OrgTaskRow[];
  } catch (e) {
    console.warn('[foresight] tasks query threw:', e);
    return [];
  }
}

// ── input assembly ─────────────────────────────────────────────────────

export async function fetchOrgForesightInputs(): Promise<ChantierForesightInput[]> {
  const orgId = getActiveOrgId();
  const today = format(new Date(), 'yyyy-MM-dd');

  const [chantiers, summaries, alerts, tasks, items, stock] = await Promise.all([
    listChantiers(),
    getSummariesForOrg(),
    fetchActiveAlerts(orgId),
    fetchOrgTasks(orgId),
    listItems(),
    listStockOnHand(),
  ]);

  const summaryByChantier = new Map(summaries.map((s) => [s.chantier_id, s]));

  const tasksByChantier = new Map<string, ScheduleTaskInput[]>();
  for (const t of tasks) {
    const arr = tasksByChantier.get(t.chantier_id) ?? [];
    arr.push({ status: t.status, durationDays: t.duration_days });
    tasksByChantier.set(t.chantier_id, arr);
  }

  const alertsByChantier = new Map<
    string,
    { critical: number; warning: number; info: number }
  >();
  for (const a of alerts) {
    if (!a.chantier_id) continue;
    const cur = alertsByChantier.get(a.chantier_id) ?? {
      critical: 0,
      warning: 0,
      info: 0,
    };
    cur[a.severity] += 1;
    alertsByChantier.set(a.chantier_id, cur);
  }

  // Org-wide low-stock count. Per-chantier stock isn't modeled today, so
  // every chantier shows the same org-level signal — accurate enough for v1.
  const stockByItem = new Map(stock.map((s) => [s.item_id, s.on_hand]));
  let lowStockCount = 0;
  for (const item of items) {
    if (item.reorder_threshold == null) continue;
    const onHand = stockByItem.get(item.id) ?? 0;
    if (onHand < item.reorder_threshold) lowStockCount += 1;
  }

  return chantiers.map((c): ChantierForesightInput => {
    const summary = summaryByChantier.get(c.id);
    const totalSpent = summary?.total_spent ?? 0;
    const cashPosition = (summary?.payments_received ?? 0) - totalSpent;
    return {
      chantierId: c.id,
      chantierName: c.name,
      cost: {
        dateStart: c.date_start,
        dateEndPrev: c.date_end_prev,
        budgetTotal: c.budget_total,
        totalSpent,
        today,
      },
      schedule: {
        dateStart: c.date_start,
        dateEndPrev: c.date_end_prev,
        today,
        tasks: tasksByChantier.get(c.id) ?? [],
      },
      alerts: alertsByChantier.get(c.id) ?? { critical: 0, warning: 0, info: 0 },
      lowStockCount,
      overduePaymentCount: 0, // v2: needs payments.due_date migration
      cashPosition,
    };
  });
}

// ── React Query hooks ──────────────────────────────────────────────────

function useOrgForesightInputs(enabled = true) {
  const { activeOrg } = useOrg();
  return useQuery({
    queryKey: ['foresight-inputs', activeOrg?.id],
    queryFn: fetchOrgForesightInputs,
    enabled: !!activeOrg && enabled,
    staleTime: 60_000,
  });
}

/**
 * Org-level foresight for the boss cockpit (HomePage). Only active chantiers
 * are counted in the portfolio rollup. Pass `enabled: false` to keep the hook
 * mounted without firing the fetch (e.g. a surface that only needs it in one mode).
 */
export function useOrgForesight(enabled = true): {
  data: OrgForesight | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
} {
  const { data: inputs, isLoading, isError, error } = useOrgForesightInputs(enabled);
  const data = inputs ? computeOrgForesight(inputs) : undefined;
  return { data, isLoading, isError, error };
}

/**
 * Per-chantier foresight for the command center. Looks the chantier up in the
 * same org-level cache so navigating between HomePage and a chantier reuses
 * the fetched inputs.
 */
export function useChantierForesight(chantierId: string | undefined): {
  data: ChantierForesight | null | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
} {
  const { data: inputs, isLoading, isError, error } = useOrgForesightInputs();
  let data: ChantierForesight | null | undefined;
  if (inputs && chantierId) {
    const input = inputs.find((c) => c.chantierId === chantierId);
    data = input ? computeChantierForesight(input) : null;
  }
  return { data, isLoading, isError, error };
}
