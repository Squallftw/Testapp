// supabase/functions/recompute-alerts/rules/task_overdue.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlertCandidate } from '../types.ts';
import { daysBetween, todayIso } from '../helpers.ts';

// task_lifecycle enum in migration 0001: ('todo', 'ongoing', 'done', 'critical').
// There is no 'cancelled' value — 'critical' is the at-risk state.
export type TaskLifecycle = 'todo' | 'ongoing' | 'done' | 'critical';

export interface OverdueTask {
  id: string;
  label: string;
  chantier_id: string;
  chantier_name: string;
  chantier_status: 'active' | 'paused' | 'completed' | 'cancelled';
  start_date: string | null;
  duration_days: number | null;
  status: TaskLifecycle;
}

export interface TaskOverdueInput {
  today: string;
  tasks: OverdueTask[];
}

export function computeTaskOverdue(input: TaskOverdueInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const t of input.tasks) {
    if (t.status === 'done') continue;
    if (t.chantier_status !== 'active') continue;
    if (!t.start_date || !t.duration_days) continue;

    // duration_days is inclusive of the start day (10 days starting 5-01 ends 5-10).
    const startMs = new Date(t.start_date + 'T00:00:00Z').getTime();
    const endMs = startMs + (t.duration_days - 1) * 86_400_000;
    const endIso = new Date(endMs).toISOString().slice(0, 10);
    const daysLate = daysBetween(endIso, input.today) - 1;
    if (daysLate <= 0) continue;

    const sev = daysLate > 7 ? 'critical' : daysLate >= 3 ? 'warning' : 'info';
    out.push({
      kind: 'task_overdue',
      severity: sev,
      title: 'Tâche en retard',
      body: `${t.label} (${t.chantier_name}) devait se terminer le ${endIso}.`,
      chantier_id: t.chantier_id,
      entity_id: t.id,
      fingerprint: `task_overdue:${t.id}`,
      payload: { days_late: daysLate, task_label: t.label, task_status: t.status },
    });
  }
  return out;
}

export async function fetchTaskOverdueData(
  sb: SupabaseClient,
  orgId: string
): Promise<TaskOverdueInput> {
  const { data, error } = await sb
    .from('tasks')
    .select('id, label, chantier_id, start_date, duration_days, status, chantiers!inner(name, status)')
    .eq('org_id', orgId)
    .is('deleted_at', null);
  if (error) throw error;
  const tasks: OverdueTask[] = (data ?? []).map((r: any) => ({
    id: r.id,
    label: r.label,
    chantier_id: r.chantier_id,
    chantier_name: r.chantiers.name,
    chantier_status: r.chantiers.status,
    start_date: r.start_date,
    duration_days: r.duration_days,
    status: r.status,
  }));
  return { today: todayIso(), tasks };
}

export async function recompute(sb: SupabaseClient, orgId: string): Promise<AlertCandidate[]> {
  const input = await fetchTaskOverdueData(sb, orgId);
  return computeTaskOverdue(input);
}
