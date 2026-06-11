import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { addDays, format, parseISO, subDays } from 'date-fns';
import { useOrg } from '@/contexts/OrgContext';
import type { Chantier } from '@/data/chantiers';
import { listAttendance } from '@/data/attendance';
import { listWorkers } from '@/data/workers';
import { getSummariesForOrg } from '@/data/budget-engine';
import { listOrgTasksLite } from '@/data/tasks';
import { useOrgForesight } from '@/data/foresight';
import type { RiskLevel } from '@/lib/foresight';
import { aggregatePerChantier } from './chantier-aggregates';

const WINDOW_DAYS = 14;

/** Per-chantier health preview shown on a project tile (Chantiers grid). */
export interface ChantierPreview {
  /** Workers present today. */
  presentToday: number;
  /** Budget consumed as a fraction of budget_total; null if no budget. */
  budgetPct: number | null;
  tasksDone: number;
  tasksTotal: number;
  /** Earliest end date (ISO) among not-done tasks; null if none. */
  nextDeadline: string | null;
  /** Foresight risk level; null when unavailable. */
  riskLevel: RiskLevel | null;
}

export interface ChantierPreviewsResult {
  byId: Map<string, ChantierPreview>;
  isLoading: boolean;
}

/**
 * Assemble per-chantier preview metrics for the project tile grid, reusing
 * the exact React Query keys HomePage already uses so the cache is shared
 * (no extra round-trips, no per-chantier N+1).
 */
export function useChantierPreviews(chantiers: Chantier[]): ChantierPreviewsResult {
  const { activeOrg } = useOrg();
  const orgId = activeOrg?.id;

  const today = format(new Date(), 'yyyy-MM-dd');
  const windowStart = format(subDays(new Date(), WINDOW_DAYS - 1), 'yyyy-MM-dd');
  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < WINDOW_DAYS; i++) {
      out.push(format(addDays(parseISO(windowStart), i), 'yyyy-MM-dd'));
    }
    return out;
  }, [windowStart]);

  const [summariesQ, attendanceQ, workersQ, tasksQ] = useQueries({
    queries: [
      {
        queryKey: ['budget-summaries', orgId],
        queryFn: () => getSummariesForOrg(),
        enabled: !!orgId,
      },
      {
        queryKey: ['attendance', orgId, 'window', windowStart, today],
        queryFn: () =>
          listAttendance({ dateRange: { start: windowStart, end: today } }),
        enabled: !!orgId,
      },
      {
        queryKey: ['workers', orgId],
        queryFn: () => listWorkers(),
        enabled: !!orgId,
      },
      {
        queryKey: ['tasks-lite', orgId],
        queryFn: () => listOrgTasksLite(),
        enabled: !!orgId,
      },
    ],
  });

  const foresight = useOrgForesight();

  const byId = useMemo(() => {
    const map = new Map<string, ChantierPreview>();

    const summariesById = new Map(
      (summariesQ.data ?? []).map((s) => [s.chantier_id, s])
    );
    const agg = aggregatePerChantier(
      attendanceQ.data ?? [],
      workersQ.data ?? [],
      days,
      today
    );

    const tasksByChantier = new Map<
      string,
      { done: number; total: number; nextEnd: string | null }
    >();
    for (const t of tasksQ.data ?? []) {
      const cur = tasksByChantier.get(t.chantier_id) ?? {
        done: 0,
        total: 0,
        nextEnd: null,
      };
      cur.total += 1;
      if (t.status === 'done') {
        cur.done += 1;
      } else if (t.start_date && t.duration_days != null) {
        const end = format(
          addDays(parseISO(t.start_date), t.duration_days),
          'yyyy-MM-dd'
        );
        if (cur.nextEnd === null || end < cur.nextEnd) cur.nextEnd = end;
      }
      tasksByChantier.set(t.chantier_id, cur);
    }

    const foresightById = new Map(
      (foresight.data?.chantiers ?? []).map((c) => [c.chantierId, c])
    );

    for (const c of chantiers) {
      const s = summariesById.get(c.id);
      const a = agg.get(c.id);
      const tk = tasksByChantier.get(c.id);
      const f = foresightById.get(c.id);

      map.set(c.id, {
        presentToday: a?.presentToday ?? 0,
        budgetPct: s && c.budget_total > 0 ? s.total_spent / c.budget_total : null,
        tasksDone: tk?.done ?? 0,
        tasksTotal: tk?.total ?? 0,
        nextDeadline: tk?.nextEnd ?? null,
        riskLevel: f ? f.risk.level : null,
      });
    }
    return map;
  }, [
    chantiers,
    summariesQ.data,
    attendanceQ.data,
    workersQ.data,
    tasksQ.data,
    foresight.data,
    days,
    today,
  ]);

  const isLoading =
    summariesQ.isLoading ||
    attendanceQ.isLoading ||
    workersQ.isLoading ||
    tasksQ.isLoading ||
    foresight.isLoading;

  return { byId, isLoading };
}
