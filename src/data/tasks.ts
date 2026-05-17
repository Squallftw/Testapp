import { todo } from './errors';

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

export type CreateTaskInput = Omit<
  Task,
  'id' | 'org_id' | 'created_at' | 'updated_at' | 'deleted_at'
>;

export type UpdateTaskInput = Partial<CreateTaskInput>;

export async function listTasksForChantier(chantierId: string): Promise<Task[]> {
  return todo('tasks.listTasksForChantier', chantierId);
}

export async function getTask(id: string): Promise<Task> {
  return todo('tasks.getTask', id);
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  return todo('tasks.createTask', input);
}

export async function updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
  return todo('tasks.updateTask', id, input);
}

export async function softDeleteTask(id: string): Promise<void> {
  return todo('tasks.softDeleteTask', id);
}

/** Reorder a list of sibling tasks (writes sort_order via bulk update). */
export async function reorderTasks(orderedIds: string[]): Promise<void> {
  return todo('tasks.reorderTasks', orderedIds);
}
