import { todo } from './errors';

export interface TaskAssignment {
  id: string;
  org_id: string;
  task_id: string;
  worker_id: string;
  created_at: string;
}

export async function listAssignmentsForTask(taskId: string): Promise<TaskAssignment[]> {
  return todo('assignments.listAssignmentsForTask', taskId);
}

export async function listAssignmentsForWorker(workerId: string): Promise<TaskAssignment[]> {
  return todo('assignments.listAssignmentsForWorker', workerId);
}

export async function assignWorkerToTask(
  taskId: string,
  workerId: string
): Promise<TaskAssignment> {
  return todo('assignments.assignWorkerToTask', taskId, workerId);
}

export async function unassignWorkerFromTask(
  taskId: string,
  workerId: string
): Promise<void> {
  return todo('assignments.unassignWorkerFromTask', taskId, workerId);
}
