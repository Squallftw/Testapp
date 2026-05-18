// supabase/functions/recompute-alerts/rules/supplier_purchase_aging.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlertCandidate } from '../types.ts';
import { daysBetween, formatMAD, todayIso } from '../helpers.ts';

export interface AgingPurchase {
  id: string;
  supplier_id: string;
  supplier_name: string;
  invoice_ref: string | null;
  purchased_at: string;
  payment_status: 'paid' | 'pending' | 'partial';
  total: number;
}

export interface AgingInput {
  today: string;
  purchases: AgingPurchase[];
}

export function computeSupplierAging(input: AgingInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const p of input.purchases) {
    if (p.payment_status === 'paid') continue;
    const aging = daysBetween(p.purchased_at, input.today) - 1;
    if (aging <= 30) continue;
    out.push({
      kind: 'supplier_purchase_aging',
      severity: aging > 60 ? 'critical' : 'warning',
      title: 'Facture fournisseur en retard',
      body: `Facture ${p.invoice_ref ?? 'sans réf.'} de ${p.supplier_name} pour ${formatMAD(p.total)}, en attente depuis ${aging} jours.`,
      chantier_id: null,
      entity_id: p.id,
      fingerprint: `supplier_purchase_aging:${p.id}`,
      payload: {
        supplier_id: p.supplier_id,
        supplier_name: p.supplier_name,
        invoice_ref: p.invoice_ref,
        total: p.total,
        days_aging: aging,
      },
    });
  }
  return out;
}

export async function fetchAgingData(sb: SupabaseClient, orgId: string): Promise<AgingInput> {
  const { data, error } = await sb
    .from('consumables_purchases')
    .select(`
      id, supplier_id, purchased_at, payment_status, invoice_ref,
      lines:consumables_purchase_lines(total),
      suppliers!inner(name)
    `)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .neq('payment_status', 'paid');
  if (error) throw error;
  const purchases: AgingPurchase[] = (data ?? []).map((p: any) => ({
    id: p.id,
    supplier_id: p.supplier_id,
    supplier_name: p.suppliers.name,
    invoice_ref: p.invoice_ref,
    purchased_at: p.purchased_at,
    payment_status: p.payment_status,
    total: (p.lines ?? []).reduce((s: number, l: any) => s + (Number(l.total) || 0), 0),
  }));
  return { today: todayIso(), purchases };
}

export async function recompute(sb: SupabaseClient, orgId: string): Promise<AlertCandidate[]> {
  const input = await fetchAgingData(sb, orgId);
  return computeSupplierAging(input);
}
