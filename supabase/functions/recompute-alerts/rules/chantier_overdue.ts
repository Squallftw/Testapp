// supabase/functions/recompute-alerts/rules/chantier_overdue.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlertCandidate } from '../types.ts';
import { daysBetween, todayIso } from '../helpers.ts';

export interface OverdueChantier {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  date_end_prev: string | null;
}

export interface OverdueInput {
  today: string;
  chantiers: OverdueChantier[];
}

export function computeChantierOverdue(input: OverdueInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const c of input.chantiers) {
    if (c.status !== 'active') continue;
    if (!c.date_end_prev) continue;
    const daysLate = daysBetween(c.date_end_prev, input.today) - 1;
    if (daysLate <= 0) continue;
    out.push({
      kind: 'chantier_overdue',
      severity: daysLate > 7 ? 'critical' : 'warning',
      title: 'Chantier en retard',
      body: `${c.name} devait se terminer le ${c.date_end_prev}, soit ${daysLate} jour${daysLate > 1 ? 's' : ''} de retard.`,
      chantier_id: c.id,
      entity_id: null,
      fingerprint: `chantier_overdue:${c.id}`,
      payload: { days_late: daysLate, date_end_prev: c.date_end_prev },
    });
  }
  return out;
}

export async function fetchOverdueData(sb: SupabaseClient, orgId: string): Promise<OverdueInput> {
  const { data, error } = await sb
    .from('chantiers')
    .select('id, name, status, date_end_prev')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .eq('status', 'active');
  if (error) throw error;
  return {
    today: todayIso(),
    chantiers: (data ?? []) as OverdueChantier[],
  };
}

export async function recompute(sb: SupabaseClient, orgId: string): Promise<AlertCandidate[]> {
  const input = await fetchOverdueData(sb, orgId);
  return computeChantierOverdue(input);
}
