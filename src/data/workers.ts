import { todo } from './errors';

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

export async function listWorkers(): Promise<Worker[]> {
  return todo('workers.listWorkers');
}

export async function getWorker(id: string): Promise<Worker> {
  return todo('workers.getWorker', id);
}

export async function createWorker(input: CreateWorkerInput): Promise<Worker> {
  return todo('workers.createWorker', input);
}

export async function updateWorker(id: string, input: UpdateWorkerInput): Promise<Worker> {
  return todo('workers.updateWorker', id, input);
}

export async function softDeleteWorker(id: string): Promise<void> {
  return todo('workers.softDeleteWorker', id);
}
