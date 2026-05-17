import { getActiveOrgId, getSupabase } from './client';
import { mapSupabaseError } from './errors';

export type AttendanceStatus = 'P' | 'A';

export interface Attendance {
  id: string;
  org_id: string;
  chantier_id: string;
  worker_id: string;
  attendance_date: string; // ISO yyyy-mm-dd
  status: AttendanceStatus;
  absence_reason: string | null;
  prime_amount: number;
  prime_motif: string | null;
  note: string | null;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DateRange {
  start: string;
  end: string;
}

export interface ListAttendanceFilter {
  chantierId?: string;
  workerId?: string;
  dateRange?: DateRange;
}

export interface UpsertAttendanceInput {
  chantier_id: string;
  worker_id: string;
  attendance_date: string;
  status: AttendanceStatus;
  absence_reason?: string | null;
  prime_amount?: number;
  prime_motif?: string | null;
  note?: string | null;
}

export async function listAttendance(
  filter: ListAttendanceFilter
): Promise<Attendance[]> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  let q = supabase
    .from('attendance')
    .select('*')
    .eq('org_id', orgId)
    .order('attendance_date', { ascending: true });
  if (filter.chantierId) q = q.eq('chantier_id', filter.chantierId);
  if (filter.workerId) q = q.eq('worker_id', filter.workerId);
  if (filter.dateRange) {
    q = q
      .gte('attendance_date', filter.dateRange.start)
      .lte('attendance_date', filter.dateRange.end);
  }
  const { data, error } = await q;
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as Attendance[];
}

/**
 * Insert or update an attendance row. Conflict target is (worker_id,
 * attendance_date) per the schema's unique constraint — one chantier per
 * worker per day.
 */
export async function upsertAttendance(
  input: UpsertAttendanceInput
): Promise<Attendance> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('attendance')
    .upsert(
      {
        org_id: orgId,
        chantier_id: input.chantier_id,
        worker_id: input.worker_id,
        attendance_date: input.attendance_date,
        status: input.status,
        absence_reason: input.absence_reason ?? null,
        prime_amount: input.prime_amount ?? 0,
        prime_motif: input.prime_motif ?? null,
        note: input.note ?? null,
      },
      { onConflict: 'worker_id,attendance_date' }
    )
    .select('*')
    .single();
  if (error) throw mapSupabaseError(error);
  return data as unknown as Attendance;
}

export async function bulkUpsertAttendance(
  inputs: UpsertAttendanceInput[]
): Promise<Attendance[]> {
  if (inputs.length === 0) return [];
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const rows = inputs.map((i) => ({
    org_id: orgId,
    chantier_id: i.chantier_id,
    worker_id: i.worker_id,
    attendance_date: i.attendance_date,
    status: i.status,
    absence_reason: i.absence_reason ?? null,
    prime_amount: i.prime_amount ?? 0,
    prime_motif: i.prime_motif ?? null,
    note: i.note ?? null,
  }));
  const { data, error } = await supabase
    .from('attendance')
    .upsert(rows, { onConflict: 'worker_id,attendance_date' })
    .select('*');
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as Attendance[];
}

export async function deleteAttendance(id: string): Promise<void> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { error } = await supabase
    .from('attendance')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId);
  if (error) throw mapSupabaseError(error);
}

export const ABSENCE_REASONS = [
  { value: 'maladie', label: 'Maladie' },
  { value: 'pas_venu', label: 'Pas venu' },
  { value: 'conge', label: 'Congé' },
  { value: 'autre', label: 'Autre' },
] as const;
