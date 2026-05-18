// supabase/functions/recompute-alerts/rules/cash_negative.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlertCandidate } from '../types.ts';
import { daysBetween, formatMAD, todayIso } from '../helpers.ts';

export interface CashChantier {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  date_start: string | null;
  total_spent: number;
  payments_received: number;
}

export interface CashInput {
  today: string;
  chantiers: CashChantier[];
}

export function computeCashNegative(input: CashInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const c of input.chantiers) {
    if (c.status !== 'active') continue;
    if (c.total_spent <= 0) continue;
    if (!c.date_start) continue;
    const daysSinceStart = daysBetween(c.date_start, input.today);
    if (daysSinceStart <= 14) continue;
    const ratio = c.payments_received / c.total_spent;
    if (ratio >= 0.70) continue;
    const deficit = c.total_spent - c.payments_received;
    out.push({
      kind: 'cash_negative',
      severity: 'warning',
      title: 'Trésorerie négative sur ce chantier',
      body: `${c.name} : paiements reçus ${formatMAD(c.payments_received)} pour ${formatMAD(c.total_spent)} de coûts engagés. Découvert de ${formatMAD(deficit)}.`,
      chantier_id: c.id,
      entity_id: null,
      fingerprint: `cash_negative:${c.id}`,
      payload: {
        received: c.payments_received,
        spent: c.total_spent,
        deficit,
        ratio,
      },
    });
  }
  return out;
}

export async function fetchCashData(sb: SupabaseClient, orgId: string): Promise<CashInput> {
  const { data: chantiers, error } = await sb
    .from('chantiers')
    .select('id, name, status, date_start')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .eq('status', 'active');
  if (error) throw error;

  const out: CashChantier[] = [];
  for (const c of (chantiers ?? []) as any[]) {
    const total_spent = await computeTotalSpentForCashRule(sb, orgId, c.id);
    const { data: pays } = await sb
      .from('chantier_payments')
      .select('amount')
      .eq('org_id', orgId).eq('chantier_id', c.id)
      .is('deleted_at', null);
    const payments_received = (pays ?? []).reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
    out.push({
      id: c.id, name: c.name, status: c.status, date_start: c.date_start,
      total_spent, payments_received,
    });
  }
  return { today: todayIso(), chantiers: out };
}

async function computeTotalSpentForCashRule(sb: SupabaseClient, orgId: string, chantierId: string): Promise<number> {
  const { data: att } = await sb.from('attendance')
    .select('worker_id, status, prime_amount')
    .eq('org_id', orgId).eq('chantier_id', chantierId);
  const { data: workers } = await sb.from('workers').select('id, daily_rate').eq('org_id', orgId);
  const rates = new Map((workers ?? []).map((w: any) => [w.id, Number(w.daily_rate) || 0]));
  let total = 0;
  for (const a of (att ?? []) as any[]) {
    if (a.status === 'P') total += rates.get(a.worker_id) ?? 0;
    total += Number(a.prime_amount) || 0;
  }
  const { data: cons } = await sb.from('consumables_consumption')
    .select('item_id, qty').eq('org_id', orgId).eq('chantier_id', chantierId).is('deleted_at', null);
  const { data: items } = await sb.from('consumables_items').select('id, average_price').eq('org_id', orgId);
  const prices = new Map((items ?? []).map((i: any) => [i.id, Number(i.average_price) || 0]));
  for (const c of (cons ?? []) as any[]) total += Number(c.qty) * (prices.get(c.item_id) ?? 0);
  const { data: deps } = await sb.from('materiel_deployments')
    .select('materiel_id, start_date, end_date, qty')
    .eq('org_id', orgId).eq('chantier_id', chantierId).is('deleted_at', null);
  const { data: mats } = await sb.from('materiels').select('id, cost_per_day').eq('org_id', orgId);
  const costs = new Map((mats ?? []).map((m: any) => [m.id, Number(m.cost_per_day) || 0]));
  for (const d of (deps ?? []) as any[]) {
    const days = Math.max(0, daysBetween(d.start_date, d.end_date));
    total += days * (costs.get(d.materiel_id) ?? 0) * (Number(d.qty) || 1);
  }
  return total;
}

export async function recompute(sb: SupabaseClient, orgId: string): Promise<AlertCandidate[]> {
  const input = await fetchCashData(sb, orgId);
  return computeCashNegative(input);
}
