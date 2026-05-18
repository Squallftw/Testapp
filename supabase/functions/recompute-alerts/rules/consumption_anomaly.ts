// supabase/functions/recompute-alerts/rules/consumption_anomaly.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlertCandidate } from '../types.ts';
import { todayIso } from '../helpers.ts';

const FLOOR_BY_UNIT: Record<string, number> = {
  'sac': 5,
  'pièce': 10,
  'm³': 0.5,
  'kg': 5,
  'm': 10,
  'm²': 5,
  'unité': 2,
  'pot': 1,
  'lot': 1,
  'litre': 5,
};
const DEFAULT_FLOOR = 5;

export interface AnomalyConsumption {
  chantier_id: string;
  chantier_name: string;
  item_id: string;
  item_name: string;
  unit: string | null;
  today_qty: number;
}

export interface AnomalyInput {
  today: string;
  consumptionToday: AnomalyConsumption[];
  avgByItem: Record<string, number>;
}

export function computeConsumptionAnomaly(input: AnomalyInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const c of input.consumptionToday) {
    const avg = input.avgByItem[c.item_id] ?? 0;
    if (avg <= 0) continue;
    const ratio = c.today_qty / avg;
    if (ratio <= 3) continue;
    const floor = c.unit ? (FLOOR_BY_UNIT[c.unit] ?? DEFAULT_FLOOR) : DEFAULT_FLOOR;
    if (c.today_qty < floor) continue;
    out.push({
      kind: 'consumption_anomaly',
      severity: 'info',
      title: 'Consommation anormale',
      body: `${c.item_name} sur ${c.chantier_name} : ${c.today_qty} ${c.unit ?? ''} aujourd'hui (moyenne ${avg.toFixed(1)} ${c.unit ?? ''}/jour sur 30 jours).`,
      chantier_id: c.chantier_id,
      entity_id: c.item_id,
      fingerprint: `consumption_anomaly:${c.chantier_id}:${c.item_id}:${input.today}`,
      payload: {
        item_id: c.item_id,
        today_qty: c.today_qty,
        avg_qty: avg,
        ratio,
      },
    });
  }
  return out;
}

export async function fetchAnomalyData(sb: SupabaseClient, orgId: string): Promise<AnomalyInput> {
  const today = todayIso();
  const { data: todayRows, error: e1 } = await sb
    .from('consumables_consumption')
    .select('chantier_id, item_id, qty, chantiers!inner(name), consumables_items!inner(name, unit)')
    .eq('org_id', orgId)
    .eq('used_at', today)
    .is('deleted_at', null);
  if (e1) throw e1;

  const consumptionToday: AnomalyConsumption[] = (todayRows ?? []).map((r: any) => ({
    chantier_id: r.chantier_id,
    chantier_name: r.chantiers.name,
    item_id: r.item_id,
    item_name: r.consumables_items.name,
    unit: r.consumables_items.unit,
    today_qty: Number(r.qty) || 0,
  }));

  const itemIds = Array.from(new Set(consumptionToday.map((r) => r.item_id)));
  const avgByItem: Record<string, number> = {};
  if (itemIds.length > 0) {
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const { data: hist, error: e2 } = await sb
      .from('consumables_consumption')
      .select('item_id, qty, used_at')
      .eq('org_id', orgId)
      .in('item_id', itemIds)
      .gte('used_at', cutoff)
      .lt('used_at', today)
      .is('deleted_at', null);
    if (e2) throw e2;
    const sumByItem: Record<string, number> = {};
    const daysByItem: Record<string, Set<string>> = {};
    for (const r of (hist ?? []) as any[]) {
      sumByItem[r.item_id] = (sumByItem[r.item_id] ?? 0) + (Number(r.qty) || 0);
      (daysByItem[r.item_id] ??= new Set()).add(r.used_at);
    }
    for (const id of itemIds) {
      const days = (daysByItem[id]?.size ?? 0) || 1;
      avgByItem[id] = (sumByItem[id] ?? 0) / days;
    }
  }

  return { today, consumptionToday, avgByItem };
}

export async function recompute(sb: SupabaseClient, orgId: string): Promise<AlertCandidate[]> {
  const input = await fetchAnomalyData(sb, orgId);
  return computeConsumptionAnomaly(input);
}
