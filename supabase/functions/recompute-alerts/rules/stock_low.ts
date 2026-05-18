// supabase/functions/recompute-alerts/rules/stock_low.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlertCandidate } from '../types.ts';

export interface StockItem {
  item_id: string;
  name: string;
  unit: string | null;
  reorder_threshold: number;
  on_hand: number;
}

export interface StockInput {
  items: StockItem[];
}

export function computeStockLow(input: StockInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const i of input.items) {
    if (i.reorder_threshold <= 0) continue;
    if (i.on_hand >= i.reorder_threshold) continue;
    out.push({
      kind: 'stock_low',
      severity: i.on_hand <= 0 ? 'critical' : 'warning',
      title: 'Stock bas',
      body: `${i.name} : ${i.on_hand} ${i.unit ?? ''} restant(s), seuil de réapprovisionnement à ${i.reorder_threshold} ${i.unit ?? ''}.`,
      chantier_id: null,
      entity_id: i.item_id,
      fingerprint: `stock_low:${i.item_id}`,
      payload: {
        item_id: i.item_id,
        current_stock: i.on_hand,
        threshold: i.reorder_threshold,
        unit: i.unit,
      },
    });
  }
  return out;
}

export async function fetchStockData(sb: SupabaseClient, orgId: string): Promise<StockInput> {
  const { data, error } = await sb
    .from('stock_on_hand_total')
    .select('item_id, name, unit, reorder_threshold, on_hand')
    .eq('org_id', orgId);
  if (error) throw error;
  return {
    items: (data ?? []).map((r: any) => ({
      item_id: r.item_id,
      name: r.name,
      unit: r.unit,
      reorder_threshold: Number(r.reorder_threshold) || 0,
      on_hand: Number(r.on_hand) || 0,
    })),
  };
}

export async function recompute(sb: SupabaseClient, orgId: string): Promise<AlertCandidate[]> {
  const input = await fetchStockData(sb, orgId);
  return computeStockLow(input);
}
