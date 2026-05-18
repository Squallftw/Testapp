import { getActiveOrgId, getSupabase } from './client';
import { mapSupabaseError, TableMissingError } from './errors';

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

/**
 * Operational health of the alerts module — used by the setup banner to
 * distinguish "feature not deployed yet" from "deployed but no alerts" from
 * "deployed and working". Single probe query, cheap enough to poll.
 */
export type AlertsHealth =
  | { state: 'no_table' }
  | { state: 'empty' }
  | { state: 'ok'; activeCount: number; lastSeenAt: string };

export interface EngineSummary {
  orgs: number;
  inserted: number;
  refreshed: number;
  resolved: number;
  skipped_cooldown: number;
  errors: number;
}

/**
 * Triggers the `recompute-alerts` Edge Function on demand. Mirrors what the
 * cron job does every 15 min. Throws `TableMissingError` if migration 0007
 * hasn't been applied; bubbles up the function's own error shape otherwise.
 *
 * The SetupBanner's « Recalculer maintenant » button is the only caller;
 * production should rely on cron, not this.
 */
export async function recomputeAlertsNow(): Promise<EngineSummary> {
  const supabase = getSupabase();
  const { data, error } = await supabase.functions.invoke<EngineSummary>(
    'recompute-alerts',
    { body: {} }
  );
  if (error) throw mapSupabaseError(error);
  if (!data) throw new Error('Edge Function returned no body');
  return data;
}

export async function getAlertsHealth(): Promise<AlertsHealth> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  // HEAD + count gets a fast row count without dragging payload back.
  const { data, error, count } = await supabase
    .from('alerts')
    .select('last_seen_at', { count: 'exact' })
    .eq('org_id', orgId)
    .is('resolved_at', null)
    .is('dismissed_at', null)
    .order('last_seen_at', { ascending: false })
    .limit(1);
  if (error) {
    const mapped = mapSupabaseError(error);
    if (mapped instanceof TableMissingError) return { state: 'no_table' };
    throw mapped;
  }
  if ((count ?? 0) === 0) return { state: 'empty' };
  const row = (data ?? [])[0] as { last_seen_at: string } | undefined;
  return {
    state: 'ok',
    activeCount: count ?? 0,
    lastSeenAt: row?.last_seen_at ?? new Date().toISOString(),
  };
}
