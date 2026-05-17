import { getActiveOrgId, getSupabase } from './client';
import { mapSupabaseError } from './errors';

export interface DateRange {
  start: string;
  end: string;
}

export interface BudgetSummary {
  chantier_id: string;
  labor_spent: number;
  equipment_spent: number;
  materials_spent: number;
  payments_received: number;
  total_spent: number;
  remaining: number;
}

// ── Internal: bucket all attendance/consumption/payments per chantier ─

interface AttendanceRow {
  chantier_id: string;
  worker_id: string;
  status: 'P' | 'A';
  prime_amount: number;
}
interface ConsumptionRow {
  chantier_id: string;
  item_id: string;
  qty: number;
}
interface PaymentRow {
  chantier_id: string;
  amount: number;
}

async function fetchAttendance(
  orgId: string,
  chantierId?: string,
  range?: DateRange
): Promise<AttendanceRow[]> {
  const supabase = getSupabase();
  let q = supabase
    .from('attendance')
    .select('chantier_id, worker_id, status, prime_amount')
    .eq('org_id', orgId);
  if (chantierId) q = q.eq('chantier_id', chantierId);
  if (range) q = q.gte('attendance_date', range.start).lte('attendance_date', range.end);
  const { data, error } = await q;
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as AttendanceRow[];
}

async function fetchConsumption(
  orgId: string,
  chantierId?: string,
  range?: DateRange
): Promise<ConsumptionRow[]> {
  const supabase = getSupabase();
  let q = supabase
    .from('consumables_consumption')
    .select('chantier_id, item_id, qty')
    .eq('org_id', orgId)
    .is('deleted_at', null);
  if (chantierId) q = q.eq('chantier_id', chantierId);
  if (range) q = q.gte('used_at', range.start).lte('used_at', range.end);
  const { data, error } = await q;
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as ConsumptionRow[];
}

async function fetchWorkerRates(orgId: string): Promise<Map<string, number>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('workers')
    .select('id, daily_rate')
    .eq('org_id', orgId);
  if (error) throw mapSupabaseError(error);
  return new Map(
    (data ?? []).map((w) => [
      (w as { id: string }).id,
      Number((w as { daily_rate: number }).daily_rate) || 0,
    ])
  );
}

async function fetchItemPrices(orgId: string): Promise<Map<string, number>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('consumables_items')
    .select('id, average_price')
    .eq('org_id', orgId);
  if (error) throw mapSupabaseError(error);
  return new Map(
    (data ?? []).map((i) => [
      (i as { id: string }).id,
      Number((i as { average_price: number }).average_price) || 0,
    ])
  );
}

async function fetchPayments(
  orgId: string,
  chantierId?: string,
  range?: DateRange
): Promise<PaymentRow[]> {
  const supabase = getSupabase();
  let q = supabase
    .from('chantier_payments')
    .select('chantier_id, amount')
    .eq('org_id', orgId)
    .is('deleted_at', null);
  if (chantierId) q = q.eq('chantier_id', chantierId);
  if (range) q = q.gte('payment_date', range.start).lte('payment_date', range.end);
  const { data, error } = await q;
  if (error) {
    // chantier_payments might not be set up yet — return empty rather than fail the dashboard.
    if (error.code === '42P01') return [];
    throw mapSupabaseError(error);
  }
  return (data ?? []) as unknown as PaymentRow[];
}

// ── Public API ────────────────────────────────────────────────────────

export async function laborSpent(
  chantierId: string,
  range?: DateRange
): Promise<number> {
  const orgId = getActiveOrgId();
  const [att, rates] = await Promise.all([
    fetchAttendance(orgId, chantierId, range),
    fetchWorkerRates(orgId),
  ]);
  let total = 0;
  for (const a of att) {
    if (a.status === 'P') total += rates.get(a.worker_id) ?? 0;
    total += Number(a.prime_amount) || 0;
  }
  return Math.round(total * 100) / 100;
}

export async function materialsSpent(
  chantierId: string,
  range?: DateRange
): Promise<number> {
  const orgId = getActiveOrgId();
  const [cons, prices] = await Promise.all([
    fetchConsumption(orgId, chantierId, range),
    fetchItemPrices(orgId),
  ]);
  let total = 0;
  for (const c of cons) {
    total += Number(c.qty) * (prices.get(c.item_id) ?? 0);
  }
  return Math.round(total * 100) / 100;
}

export async function equipmentSpent(
  _chantierId: string,
  _range?: DateRange
): Promise<number> {
  // Matériel cost tracking is post-beta; returning 0 is the schema-ready answer.
  return 0;
}

export async function paymentsReceived(
  chantierId: string,
  range?: DateRange
): Promise<number> {
  const orgId = getActiveOrgId();
  const rows = await fetchPayments(orgId, chantierId, range);
  return rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
}

export async function getSummary(
  chantierId: string,
  range?: DateRange
): Promise<BudgetSummary> {
  const [labor, materials, equipment, payments] = await Promise.all([
    laborSpent(chantierId, range),
    materialsSpent(chantierId, range),
    equipmentSpent(chantierId, range),
    paymentsReceived(chantierId, range),
  ]);
  const total = labor + materials + equipment;
  return {
    chantier_id: chantierId,
    labor_spent: labor,
    materials_spent: materials,
    equipment_spent: equipment,
    payments_received: payments,
    total_spent: total,
    remaining: 0, // computed in the page using the chantier's budget_total
  };
}

/**
 * One round-trip per data type (4 queries total) then aggregate per chantier
 * in JS. For a small firm (<10 chantiers, ~30 workers, hundreds of rows) this
 * is comfortably under 100 ms. Will need an SQL aggregate (RPC or view) if
 * we ever hit thousands of attendance rows.
 */
export async function getSummariesForOrg(
  range?: DateRange
): Promise<BudgetSummary[]> {
  const orgId = getActiveOrgId();
  const [att, cons, rates, prices, payments] = await Promise.all([
    fetchAttendance(orgId, undefined, range),
    fetchConsumption(orgId, undefined, range),
    fetchWorkerRates(orgId),
    fetchItemPrices(orgId),
    fetchPayments(orgId, undefined, range),
  ]);

  const acc = new Map<string, BudgetSummary>();
  function bump(chantierId: string): BudgetSummary {
    let s = acc.get(chantierId);
    if (!s) {
      s = {
        chantier_id: chantierId,
        labor_spent: 0,
        materials_spent: 0,
        equipment_spent: 0,
        payments_received: 0,
        total_spent: 0,
        remaining: 0,
      };
      acc.set(chantierId, s);
    }
    return s;
  }

  for (const a of att) {
    const s = bump(a.chantier_id);
    if (a.status === 'P') s.labor_spent += rates.get(a.worker_id) ?? 0;
    s.labor_spent += Number(a.prime_amount) || 0;
  }
  for (const c of cons) {
    const s = bump(c.chantier_id);
    s.materials_spent += Number(c.qty) * (prices.get(c.item_id) ?? 0);
  }
  for (const p of payments) {
    const s = bump(p.chantier_id);
    s.payments_received += Number(p.amount) || 0;
  }

  const out = Array.from(acc.values());
  for (const s of out) {
    s.labor_spent = Math.round(s.labor_spent * 100) / 100;
    s.materials_spent = Math.round(s.materials_spent * 100) / 100;
    s.payments_received = Math.round(s.payments_received * 100) / 100;
    s.total_spent = s.labor_spent + s.materials_spent + s.equipment_spent;
  }
  return out;
}
