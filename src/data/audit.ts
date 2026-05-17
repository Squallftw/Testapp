import { todo } from './errors';

export type AuditAction = 'insert' | 'update' | 'delete';

export interface AuditEntry {
  id: string;
  org_id: string;
  user_id: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface ListAuditFilter {
  entityType?: string;
  entityId?: string;
  userId?: string;
  /** ISO timestamp; entries newer than this. */
  since?: string;
  limit?: number;
}

export async function listAuditLog(filter?: ListAuditFilter): Promise<AuditEntry[]> {
  return todo('audit.listAuditLog', filter);
}
