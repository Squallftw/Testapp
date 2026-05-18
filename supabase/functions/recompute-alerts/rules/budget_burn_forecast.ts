// supabase/functions/recompute-alerts/rules/budget_burn_forecast.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlertCandidate } from '../types.ts';
import { daysBetween, formatMAD, formatPercent, todayIso } from '../helpers.ts';

export interface ForecastChantier {
  id: string;
  name: string;
  date_start: string | null;
  date_end_prev: string | null;
  budget_total: number;
  total_spent: number;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
}

export interface ForecastInput {
  today: string;
  chantiers: ForecastChantier[];
}

export function computeBudgetBurnForecast(input: ForecastInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const c of input.chantiers) {
    if (c.status !== 'active') continue;
    if (!c.date_start || !c.date_end_prev) continue;
    if (c.budget_total <= 0) continue;

    const daysElapsed = daysBetween(c.date_start, input.today);
    const daysTotal = daysBetween(c.date_start, c.date_end_prev);
    if (daysElapsed < 7) continue;
    if (daysTotal <= 0) continue;
    if (daysElapsed / daysTotal >= 0.95) continue;

    const projected = (c.total_spent / daysElapsed) * daysTotal;
    const pct = projected / c.budget_total;
    if (pct <= 1.0) continue;

    out.push({
      kind: 'budget_burn_forecast',
      severity: pct > 1.1 ? 'critical' : 'warning',
      title: 'Risque de dépassement de budget',
      body: `Au rythme actuel, ${c.name} terminera à ${formatMAD(projected)} (${formatPercent(pct)} du budget de ${formatMAD(c.budget_total)}).`,
      chantier_id: c.id,
      entity_id: null,
      fingerprint: `budget_burn_forecast:${c.id}`,
      payload: {
        projected: Math.round(projected),
        budget_total: c.budget_total,
        pct,
        days_elapsed: daysElapsed,
        days_total: daysTotal,
      },
    });
  }
  return out;
}

export async function fetchForecastData(
  sb: SupabaseClient,
  orgId: string
): Promise<ForecastInput> {
  const { data: chantiers, error: cErr } = await sb
    .from('chantiers')
    .select('id, name, date_start, date_end_prev, budget_total, status')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .eq('status', 'active');
  if (cErr) throw cErr;

  const result: ForecastInput = { today: todayIso(), chantiers: [] };
  for (const c of (chantiers ?? []) as Array<{ id: string; name: string; date_start: string | null; date_end_prev: string | null; budget_total: number; status: string }>) {
    const total_spent = await computeTotalSpent(sb, orgId, c.id);
    result.chantiers.push({
      id: c.id,
      name: c.name,
      date_start: c.date_start,
      date_end_prev: c.date_end_prev,
      budget_total: Number(c.budget_total),
      total_spent,
      status: c.status as ForecastChantier['status'],
    });
  }
  return result;
}

async function computeTotalSpent(sb: SupabaseClient, orgId: string, chantierId: string): Promise<number> {
  // Labour: sum daily_rate × P attendance + prime_amount
  const { data: att } = await sb
    .from('attendance')
    .select('worker_id, status, prime_amount')
    .eq('org_id', orgId)
    .eq('chantier_id', chantierId);
  const { data: workers } = await sb
    .from('workers')
    .select('id, daily_rate')
    .eq('org_id', orgId);
  const rates = new Map<string, number>((workers ?? []).map((w: any) => [w.id, Number(w.daily_rate) || 0]));
  let labour = 0;
  for (const a of (att ?? []) as any[]) {
    if (a.status === 'P') labour += rates.get(a.worker_id) ?? 0;
    labour += Number(a.prime_amount) || 0;
  }

  // Materials: sum qty × average_price
  const { data: cons } = await sb
    .from('consumables_consumption')
    .select('item_id, qty')
    .eq('org_id', orgId)
    .eq('chantier_id', chantierId)
    .is('deleted_at', null);
  const { data: items } = await sb
    .from('consumables_items')
    .select('id, average_price')
    .eq('org_id', orgId);
  const prices = new Map<string, number>((items ?? []).map((i: any) => [i.id, Number(i.average_price) || 0]));
  let materials = 0;
  for (const c of (cons ?? []) as any[]) {
    materials += Number(c.qty) * (prices.get(c.item_id) ?? 0);
  }

  // Equipment: sum deployment days × cost_per_day × qty
  const { data: deps } = await sb
    .from('materiel_deployments')
    .select('materiel_id, start_date, end_date, qty')
    .eq('org_id', orgId)
    .eq('chantier_id', chantierId)
    .is('deleted_at', null);
  const { data: materiels } = await sb
    .from('materiels')
    .select('id, cost_per_day')
    .eq('org_id', orgId);
  const costs = new Map<string, number>((materiels ?? []).map((m: any) => [m.id, Number(m.cost_per_day) || 0]));
  let equipment = 0;
  for (const d of (deps ?? []) as any[]) {
    const days = daysBetween(d.start_date, d.end_date);
    const cpd = costs.get(d.materiel_id) ?? 0;
    const q = Number(d.qty) || 1;
    equipment += Math.max(days, 0) * cpd * q;
  }

  return labour + materials + equipment;
}

export async function recompute(sb: SupabaseClient, orgId: string): Promise<AlertCandidate[]> {
  const input = await fetchForecastData(sb, orgId);
  return computeBudgetBurnForecast(input);
}
