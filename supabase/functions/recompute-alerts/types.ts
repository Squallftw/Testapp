// supabase/functions/recompute-alerts/types.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type AlertKind =
  | 'budget_burn_forecast'
  | 'budget_category_exceeded'
  | 'chantier_overdue'
  | 'task_overdue'
  | 'stock_low'
  | 'cash_negative'
  | 'supplier_purchase_aging'
  | 'consumption_anomaly';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertCandidate {
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  body: string;
  chantier_id: string | null;
  entity_id: string | null;
  fingerprint: string;
  payload: Record<string, unknown>;
}

export interface Rule {
  kind: AlertKind;
  recompute: (sb: SupabaseClient, orgId: string) => Promise<AlertCandidate[]>;
}

export interface EngineSummary {
  orgs: number;
  inserted: number;
  refreshed: number;
  resolved: number;
  skipped_cooldown: number;
  errors: number;
}
