import { todo } from './errors';

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
  start: string; // ISO yyyy-mm-dd
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
  absence_reason?: string;
  prime_amount?: number;
  prime_motif?: string;
  note?: string;
}

export async function listAttendance(filter: ListAttendanceFilter): Promise<Attendance[]> {
  return todo('attendance.listAttendance', filter);
}

/** Insert or update an attendance row (unique on worker_id + date). */
export async function upsertAttendance(input: UpsertAttendanceInput): Promise<Attendance> {
  return todo('attendance.upsertAttendance', input);
}

/** Batch upsert — for grid-style monthly edits. */
export async function bulkUpsertAttendance(
  inputs: UpsertAttendanceInput[]
): Promise<Attendance[]> {
  return todo('attendance.bulkUpsertAttendance', inputs);
}

export async function deleteAttendance(id: string): Promise<void> {
  return todo('attendance.deleteAttendance', id);
}
