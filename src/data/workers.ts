import { getActiveOrgId, getSupabase } from './client';
import { mapSupabaseError, NotFoundError } from './errors';

export type WorkerStatus = 'active' | 'inactive';

export interface Worker {
  id: string;
  org_id: string;
  full_name: string;
  role: string | null;
  daily_rate: number;
  phone: string | null;
  cin: string | null;
  hire_date: string | null;
  status: WorkerStatus;
  hue: number | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type CreateWorkerInput = Omit<
  Worker,
  'id' | 'org_id' | 'created_at' | 'updated_at' | 'deleted_at'
>;

export type UpdateWorkerInput = Partial<CreateWorkerInput>;

export const WORKER_STATUS_LABEL: Record<WorkerStatus, string> = {
  active: 'Actif',
  inactive: 'Inactif',
};

export async function listWorkers(): Promise<Worker[]> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('workers')
    .select('*')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('full_name', { ascending: true });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as Worker[];
}

export async function getWorker(id: string): Promise<Worker> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('workers')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) throw new NotFoundError(`Ouvrier ${id} introuvable`);
  return data as unknown as Worker;
}

export async function createWorker(input: CreateWorkerInput): Promise<Worker> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('workers')
    .insert({ ...input, org_id: orgId })
    .select('*')
    .single();
  if (error) throw mapSupabaseError(error);
  return data as unknown as Worker;
}

export async function updateWorker(
  id: string,
  input: UpdateWorkerInput
): Promise<Worker> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('workers')
    .update(input)
    .eq('id', id)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .select('*')
    .single();
  if (error) throw mapSupabaseError(error);
  return data as unknown as Worker;
}

export async function softDeleteWorker(id: string): Promise<void> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { error } = await supabase
    .from('workers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)
    .is('deleted_at', null);
  if (error) throw mapSupabaseError(error);
}

/** Hue (0–360) → HSL color. Used as the pointage grid row band. */
export function hueToColor(hue: number | null): string {
  if (hue === null || !Number.isFinite(hue)) return '#54667A';
  return `hsl(${hue % 360}, 45%, 50%)`;
}
