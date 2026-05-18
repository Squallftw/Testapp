import { getActiveOrgId, getSupabase } from './client';
import { mapSupabaseError } from './errors';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export type AlertKind =
  | 'budget_burn_forecast'
  | 'budget_category_exceeded'
  | 'chantier_overdue'
  | 'task_overdue'
  | 'stock_low'
  | 'cash_negative'
  | 'supplier_purchase_aging'
  | 'consumption_anomaly'
  | 'daily_entry_missing';

export interface Alert {
  id: string;
  org_id: string;
  chantier_id: string | null;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  body: string | null;
  payload: Record<string, unknown>;
  entity_id: string | null;
  fingerprint: string;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  dismissed_at: string | null;
  dismissed_by: string | null;
  created_at: string;
  updated_at: string;
}

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

function sortBySeverityThenRecent(a: Alert, b: Alert): number {
  const sevDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  if (sevDiff !== 0) return sevDiff;
  return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
}

/** Active alerts (not resolved, not dismissed), severity-then-recency sorted. */
export async function listActiveAlerts(): Promise<Alert[]> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('alerts')
    .select('*')
    .eq('org_id', orgId)
    .is('resolved_at', null)
    .is('dismissed_at', null);
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as unknown as Alert[]).sort(sortBySeverityThenRecent);
}

/** Active alerts scoped to one chantier (plus org-wide ones with chantier_id NULL). */
export async function listAlertsForChantier(chantierId: string): Promise<Alert[]> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('alerts')
    .select('*')
    .eq('org_id', orgId)
    .or(`chantier_id.eq.${chantierId},chantier_id.is.null`)
    .is('resolved_at', null)
    .is('dismissed_at', null);
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as unknown as Alert[]).sort(sortBySeverityThenRecent);
}

/** History view — resolved + dismissed alerts, most-recent first. */
export async function listAlertHistory(): Promise<Alert[]> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('alerts')
    .select('*')
    .eq('org_id', orgId)
    .or('resolved_at.not.is.null,dismissed_at.not.is.null')
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as Alert[];
}

/**
 * Dismiss an alert via the SECURITY DEFINER RPC defined in
 * 0007_alerts.sql:77-126. The RPC re-checks visibility, atomically locks
 * the row, and sets dismissed_at + dismissed_by. Throws if the alert is
 * already resolved or dismissed.
 */
export async function dismissAlert(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('dismiss_alert', { p_id: id });
  if (error) throw mapSupabaseError(error);
}

/** Undo a dismissal — RPC from 0007_alerts.sql:133-176. */
export async function undismissAlert(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('undismiss_alert', { p_id: id });
  if (error) throw mapSupabaseError(error);
}
