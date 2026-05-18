// supabase/functions/recompute-alerts/rules/budget_category_exceeded.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlertCandidate } from '../types.ts';
import { daysBetween, formatMAD, formatPercent } from '../helpers.ts';

const CATEGORIES = [
  { key: 'labor',     label: 'main d\'œuvre' },
  { key: 'materials', label: 'matériaux' },
  { key: 'equipment', label: 'matériels' },
] as const;

export interface CategoryChantier {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  budget_labor: number;
  labor_spent: number;
  budget_materials: number;
  materials_spent: number;
  budget_equipment: number;
  equipment_spent: number;
}

export interface CategoryInput {
  chantiers: CategoryChantier[];
}

export function computeCategoryExceeded(input: CategoryInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const c of input.chantiers) {
    if (c.status !== 'active') continue;
    for (const cat of CATEGORIES) {
      const budget = c[`budget_${cat.key}` as keyof CategoryChantier] as number;
      const spent = c[`${cat.key}_spent` as keyof CategoryChantier] as number;
      if (budget <= 0) continue;
      if (spent <= budget) continue;
      const pct = spent / budget;
      out.push({
        kind: 'budget_category_exceeded',
        severity: pct > 1.1 ? 'critical' : 'warning',
        title: `Budget ${cat.label} dépassé`,
        body: `${cat.label} a consommé ${formatMAD(spent)} sur un budget de ${formatMAD(budget)} (${formatPercent(pct)}).`,
        chantier_id: c.id,
        entity_id: null,
        fingerprint: `budget_category_exceeded:${c.id}:${cat.key}`,
        payload: { category: cat.key, spent, budget, pct },
      });
    }
  }
  return out;
}

export async function fetchCategoryData(
  sb: SupabaseClient,
  orgId: string
): Promise<CategoryInput> {
  const { data: chantiers, error } = await sb
    .from('chantiers')
    .select('id, name, status, budget_labor, budget_materials, budget_equipment')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .eq('status', 'active');
  if (error) throw error;

  const out: CategoryChantier[] = [];
  for (const c of (chantiers ?? []) as any[]) {
    const spent = await computeCategorySpent(sb, orgId, c.id);
    out.push({
      id: c.id,
      name: c.name,
      status: c.status,
      budget_labor: Number(c.budget_labor) || 0,
      labor_spent: spent.labor,
      budget_materials: Number(c.budget_materials) || 0,
      materials_spent: spent.materials,
      budget_equipment: Number(c.budget_equipment) || 0,
      equipment_spent: spent.equipment,
    });
  }
  return { chantiers: out };
}

async function computeCategorySpent(
  sb: SupabaseClient,
  orgId: string,
  chantierId: string
): Promise<{ labor: number; materials: number; equipment: number }> {
  const { data: att } = await sb
    .from('attendance')
    .select('worker_id, status, prime_amount')
    .eq('org_id', orgId).eq('chantier_id', chantierId);
  const { data: workers } = await sb.from('workers').select('id, daily_rate').eq('org_id', orgId);
  const rates = new Map((workers ?? []).map((w: any) => [w.id, Number(w.daily_rate) || 0]));
  let labor = 0;
  for (const a of (att ?? []) as any[]) {
    if (a.status === 'P') labor += rates.get(a.worker_id) ?? 0;
    labor += Number(a.prime_amount) || 0;
  }

  const { data: cons } = await sb
    .from('consumables_consumption')
    .select('item_id, qty')
    .eq('org_id', orgId).eq('chantier_id', chantierId)
    .is('deleted_at', null);
  const { data: items } = await sb.from('consumables_items').select('id, average_price').eq('org_id', orgId);
  const prices = new Map((items ?? []).map((i: any) => [i.id, Number(i.average_price) || 0]));
  let materials = 0;
  for (const c of (cons ?? []) as any[]) {
    materials += Number(c.qty) * (prices.get(c.item_id) ?? 0);
  }

  const { data: deps } = await sb
    .from('materiel_deployments')
    .select('materiel_id, start_date, end_date, qty')
    .eq('org_id', orgId).eq('chantier_id', chantierId)
    .is('deleted_at', null);
  const { data: materiels } = await sb.from('materiels').select('id, cost_per_day').eq('org_id', orgId);
  const costs = new Map((materiels ?? []).map((m: any) => [m.id, Number(m.cost_per_day) || 0]));
  let equipment = 0;
  for (const d of (deps ?? []) as any[]) {
    const days = Math.max(0, daysBetween(d.start_date, d.end_date));
    equipment += days * (costs.get(d.materiel_id) ?? 0) * (Number(d.qty) || 1);
  }

  return { labor, materials, equipment };
}

export async function recompute(sb: SupabaseClient, orgId: string): Promise<AlertCandidate[]> {
  const input = await fetchCategoryData(sb, orgId);
  return computeCategoryExceeded(input);
}
