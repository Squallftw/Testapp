import { getActiveOrgId, getSupabase } from './client';
import { mapSupabaseError, NotFoundError } from './errors';

export type TaskStatus = 'todo' | 'ongoing' | 'done' | 'critical';

export interface Task {
  id: string;
  org_id: string;
  chantier_id: string;
  parent_task_id: string | null;
  label: string;
  start_date: string | null;
  duration_days: number | null;
  status: TaskStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TaskWithAssignments extends Task {
  /** Worker ids assigned to this task — empty array if none. */
  assignee_ids: string[];
}

export interface CreateTaskInput {
  chantier_id: string;
  parent_task_id?: string | null;
  label: string;
  start_date?: string | null;
  duration_days?: number | null;
  status?: TaskStatus;
  sort_order?: number;
  assignee_worker_ids?: string[];
}

export interface UpdateTaskInput {
  label?: string;
  parent_task_id?: string | null;
  start_date?: string | null;
  duration_days?: number | null;
  status?: TaskStatus;
  sort_order?: number;
  /** Present → replace assignments; absent → leave unchanged. */
  assignee_worker_ids?: string[];
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'À faire',
  ongoing: 'En cours',
  done: 'Terminé',
  critical: 'Critique',
};

// Hex colors that pair with the existing bati palette. Kept in the data layer
// so the Gantt and any future task surface render consistently.
export const TASK_STATUS_COLOR: Record<TaskStatus, { bar: string; soft: string; text: string }> = {
  todo:     { bar: '#94A3B8', soft: '#E5E7EB', text: '#334155' },
  ongoing:  { bar: '#C58122', soft: '#F2E1C8', text: '#7C5417' },
  done:     { bar: '#2E9152', soft: '#D8EBDD', text: '#1F6A3A' },
  critical: { bar: '#C25B3F', soft: '#F2DCD3', text: '#8A3D26' },
};

// ── list / get ─────────────────────────────────────────────────────────

/**
 * List tasks for a chantier with their worker assignments. Returns a flat
 * array — the page builds the parent/child tree client-side from
 * `parent_task_id`. Soft-deleted rows excluded; ordered by sort_order then
 * start_date so the natural display order is preserved.
 */
export async function listTasksForChantier(
  chantierId: string
): Promise<TaskWithAssignments[]> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('tasks')
    .select('*, task_assignments(worker_id)')
    .eq('org_id', orgId)
    .eq('chantier_id', chantierId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('start_date', { ascending: true, nullsFirst: false });
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map((row) => {
    const r = row as Task & {
      task_assignments?: Array<{ worker_id: string }>;
    };
    return {
      id: r.id,
      org_id: r.org_id,
      chantier_id: r.chantier_id,
      parent_task_id: r.parent_task_id,
      label: r.label,
      start_date: r.start_date,
      duration_days: r.duration_days,
      status: r.status,
      sort_order: r.sort_order,
      created_at: r.created_at,
      updated_at: r.updated_at,
      deleted_at: r.deleted_at,
      assignee_ids: (r.task_assignments ?? []).map((a) => a.worker_id),
    };
  });
}

export async function getTask(id: string): Promise<TaskWithAssignments> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('tasks')
    .select('*, task_assignments(worker_id)')
    .eq('id', id)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) throw new NotFoundError(`Tâche ${id} introuvable`);
  const r = data as Task & { task_assignments?: Array<{ worker_id: string }> };
  return {
    id: r.id,
    org_id: r.org_id,
    chantier_id: r.chantier_id,
    parent_task_id: r.parent_task_id,
    label: r.label,
    start_date: r.start_date,
    duration_days: r.duration_days,
    status: r.status,
    sort_order: r.sort_order,
    created_at: r.created_at,
    updated_at: r.updated_at,
    deleted_at: r.deleted_at,
    assignee_ids: (r.task_assignments ?? []).map((a) => a.worker_id),
  };
}

// ── create / update / delete ───────────────────────────────────────────

/**
 * Create a task and its worker assignments atomically via the
 * create_task_with_assignments RPC (migration 0004).
 */
export async function createTask(input: CreateTaskInput): Promise<Task> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('create_task_with_assignments', {
    p_input: {
      org_id: orgId,
      chantier_id: input.chantier_id,
      parent_task_id: input.parent_task_id ?? null,
      label: input.label,
      start_date: input.start_date ?? null,
      duration_days: input.duration_days ?? null,
      status: input.status ?? 'todo',
      sort_order: input.sort_order ?? 0,
      assignee_worker_ids: input.assignee_worker_ids ?? [],
    },
  });
  if (error) throw mapSupabaseError(error);
  if (!data) throw new NotFoundError('Tâche introuvable après création');
  return data as Task;
}

/**
 * Update a task and (optionally) diff-and-apply its worker assignments via
 * the update_task_with_assignments RPC. If `assignee_worker_ids` is omitted
 * from `input`, existing assignments are left alone.
 */
export async function updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
  const supabase = getSupabase();
  const payload: Record<string, unknown> = {};
  if (input.label !== undefined) payload.label = input.label;
  if (input.parent_task_id !== undefined) payload.parent_task_id = input.parent_task_id;
  if (input.start_date !== undefined) payload.start_date = input.start_date;
  if (input.duration_days !== undefined) payload.duration_days = input.duration_days;
  if (input.status !== undefined) payload.status = input.status;
  if (input.sort_order !== undefined) payload.sort_order = input.sort_order;
  if (input.assignee_worker_ids !== undefined) {
    payload.assignee_worker_ids = input.assignee_worker_ids;
  }
  const { data, error } = await supabase.rpc('update_task_with_assignments', {
    p_task_id: id,
    p_input: payload,
  });
  if (error) throw mapSupabaseError(error);
  if (!data) throw new NotFoundError(`Tâche ${id} introuvable`);
  return data as Task;
}

/**
 * Soft-delete a task. Refuses to delete a task that still has non-deleted
 * children — the caller must move/delete the children first to avoid leaving
 * orphaned subtrees visible in the tree view.
 */
export async function softDeleteTask(id: string): Promise<void> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();

  const { data: kids, error: kErr } = await supabase
    .from('tasks')
    .select('id')
    .eq('org_id', orgId)
    .eq('parent_task_id', id)
    .is('deleted_at', null)
    .limit(1);
  if (kErr) throw mapSupabaseError(kErr);
  if ((kids ?? []).length > 0) {
    throw new Error(
      'Cette tâche contient des sous-tâches. Supprimez ou déplacez-les d\'abord.'
    );
  }

  const { error } = await supabase
    .from('tasks')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)
    .is('deleted_at', null);
  if (error) throw mapSupabaseError(error);
}

/**
 * Reorder a list of sibling tasks. Writes sort_order = index for each id in
 * the array. Caller is responsible for ensuring the ids share a parent.
 */
export async function reorderTasks(orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  // Run updates in parallel — they target distinct rows so order doesn't matter.
  await Promise.all(
    orderedIds.map((id, idx) =>
      supabase
        .from('tasks')
        .update({ sort_order: idx, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('org_id', orgId)
        .is('deleted_at', null)
    )
  );
}

// ── assignment helpers (per-worker, used by the edit modal) ────────────

export async function assignWorker(taskId: string, workerId: string): Promise<void> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { error } = await supabase
    .from('task_assignments')
    .insert({ org_id: orgId, task_id: taskId, worker_id: workerId });
  if (error && error.code !== '23505') throw mapSupabaseError(error);
}

export async function unassignWorker(taskId: string, workerId: string): Promise<void> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { error } = await supabase
    .from('task_assignments')
    .delete()
    .eq('org_id', orgId)
    .eq('task_id', taskId)
    .eq('worker_id', workerId);
  if (error) throw mapSupabaseError(error);
}
