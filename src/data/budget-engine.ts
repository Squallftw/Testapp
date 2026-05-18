import { getActiveOrgId, getSupabase } from './client';
import { mapSupabaseError } from './errors';
import { deploymentCost, deploymentDays } from './materiels';

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
  attendance_date: string;
  status: 'P' | 'A';
  prime_amount: number;
}
interface ConsumptionRow {
  chantier_id: string;
  item_id: string;
  used_at: string;
  qty: number;
}
interface PaymentRow {
  chantier_id: string;
  payment_date: string;
  amount: number;
}
interface DeploymentRow {
  chantier_id: string;
  materiel_id: string;
  start_date: string;
  end_date: string;
  qty: number | null;
}

interface WorkerInfo {
  name: string;
  rate: number;
}
interface ItemInfo {
  name: string;
  price: number;
}
interface MaterielInfo {
  name: string;
  type: 'possede' | 'loue';
  cost_per_day: number;
}

async function fetchAttendance(
  orgId: string,
  chantierId?: string,
  range?: DateRange
): Promise<AttendanceRow[]> {
  const supabase = getSupabase();
  let q = supabase
    .from('attendance')
    .select('chantier_id, worker_id, attendance_date, status, prime_amount')
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
    .select('chantier_id, item_id, used_at, qty')
    .eq('org_id', orgId)
    .is('deleted_at', null);
  if (chantierId) q = q.eq('chantier_id', chantierId);
  if (range) q = q.gte('used_at', range.start).lte('used_at', range.end);
  const { data, error } = await q;
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as ConsumptionRow[];
}

async function fetchWorkerInfo(orgId: string): Promise<Map<string, WorkerInfo>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('workers')
    .select('id, full_name, daily_rate')
    .eq('org_id', orgId);
  if (error) throw mapSupabaseError(error);
  return new Map(
    (data ?? []).map((w) => {
      const row = w as { id: string; full_name: string; daily_rate: number };
      return [row.id, { name: row.full_name, rate: Number(row.daily_rate) || 0 }];
    })
  );
}

async function fetchItemInfo(orgId: string): Promise<Map<string, ItemInfo>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('consumables_items')
    .select('id, name, average_price')
    .eq('org_id', orgId);
  if (error) throw mapSupabaseError(error);
  return new Map(
    (data ?? []).map((i) => {
      const row = i as { id: string; name: string; average_price: number };
      return [row.id, { name: row.name, price: Number(row.average_price) || 0 }];
    })
  );
}

async function fetchDeployments(
  orgId: string,
  chantierId?: string
): Promise<DeploymentRow[]> {
  const supabase = getSupabase();
  let q = supabase
    .from('materiel_deployments')
    .select('chantier_id, materiel_id, start_date, end_date, qty')
    .eq('org_id', orgId)
    .is('deleted_at', null);
  if (chantierId) q = q.eq('chantier_id', chantierId);
  const { data, error } = await q;
  if (error) {
    if (error.code === '42P01') return [];
    throw mapSupabaseError(error);
  }
  return (data ?? []) as unknown as DeploymentRow[];
}

async function fetchMaterielInfo(
  orgId: string
): Promise<Map<string, MaterielInfo>> {
  // Do NOT filter by deleted_at: a soft-deleted materiel's historical
  // deployments must still cost-out correctly. The rate snapshot at
  // deployment time would be cleaner but isn't stored on the row today.
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('materiels')
    .select('id, name, type, cost_per_day')
    .eq('org_id', orgId);
  if (error) {
    if (error.code === '42P01') return new Map();
    throw mapSupabaseError(error);
  }
  return new Map(
    (data ?? []).map((m) => {
      const row = m as {
        id: string;
        name: string;
        type: 'possede' | 'loue';
        cost_per_day: number;
      };
      return [
        row.id,
        {
          name: row.name,
          type: row.type,
          cost_per_day: Number(row.cost_per_day) || 0,
        },
      ];
    })
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
    .select('chantier_id, payment_date, amount')
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
  const [att, workers] = await Promise.all([
    fetchAttendance(orgId, chantierId, range),
    fetchWorkerInfo(orgId),
  ]);
  let total = 0;
  for (const a of att) {
    if (a.status === 'P') total += workers.get(a.worker_id)?.rate ?? 0;
    total += Number(a.prime_amount) || 0;
  }
  return Math.round(total * 100) / 100;
}

export async function materialsSpent(
  chantierId: string,
  range?: DateRange
): Promise<number> {
  const orgId = getActiveOrgId();
  const [cons, items] = await Promise.all([
    fetchConsumption(orgId, chantierId, range),
    fetchItemInfo(orgId),
  ]);
  let total = 0;
  for (const c of cons) {
    total += Number(c.qty) * (items.get(c.item_id)?.price ?? 0);
  }
  return Math.round(total * 100) / 100;
}

export async function equipmentSpent(
  chantierId: string,
  _range?: DateRange
): Promise<number> {
  const orgId = getActiveOrgId();
  const [deployments, materiels] = await Promise.all([
    fetchDeployments(orgId, chantierId),
    fetchMaterielInfo(orgId),
  ]);
  let total = 0;
  for (const d of deployments) {
    total += deploymentCost(d, materiels.get(d.materiel_id)?.cost_per_day ?? 0);
  }
  return Math.round(total * 100) / 100;
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
  const [att, cons, workers, items, payments, deployments, materiels] =
    await Promise.all([
      fetchAttendance(orgId, undefined, range),
      fetchConsumption(orgId, undefined, range),
      fetchWorkerInfo(orgId),
      fetchItemInfo(orgId),
      fetchPayments(orgId, undefined, range),
      fetchDeployments(orgId),
      fetchMaterielInfo(orgId),
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
    if (a.status === 'P') s.labor_spent += workers.get(a.worker_id)?.rate ?? 0;
    s.labor_spent += Number(a.prime_amount) || 0;
  }
  for (const c of cons) {
    const s = bump(c.chantier_id);
    s.materials_spent += Number(c.qty) * (items.get(c.item_id)?.price ?? 0);
  }
  for (const p of payments) {
    const s = bump(p.chantier_id);
    s.payments_received += Number(p.amount) || 0;
  }
  for (const d of deployments) {
    const s = bump(d.chantier_id);
    s.equipment_spent += deploymentCost(d, materiels.get(d.materiel_id)?.cost_per_day ?? 0);
  }

  const out = Array.from(acc.values());
  for (const s of out) {
    s.labor_spent = Math.round(s.labor_spent * 100) / 100;
    s.materials_spent = Math.round(s.materials_spent * 100) / 100;
    s.equipment_spent = Math.round(s.equipment_spent * 100) / 100;
    s.payments_received = Math.round(s.payments_received * 100) / 100;
    s.total_spent = s.labor_spent + s.materials_spent + s.equipment_spent;
  }
  return out;
}

// ── Breakdown API for the per-category dashboard modal ────────────────

export interface DailyPoint {
  date: string; // ISO yyyy-mm-dd
  amount: number;
}

export interface LaborBreakdown {
  daily: DailyPoint[];
  byWorker: { worker_id: string; name: string; amount: number; days: number }[];
  totalDaysWorked: number;
  totalPrimes: number;
}

export interface MaterialsBreakdown {
  daily: DailyPoint[];
  byItem: { item_id: string; name: string; amount: number; qty: number }[];
  distinctItems: number;
  events: number;
}

export interface EquipmentDeployment {
  materiel_id: string;
  name: string;
  start: string;
  end: string;
  amount: number;
}

export interface EquipmentBreakdown {
  byMateriel: {
    materiel_id: string;
    name: string;
    amount: number;
    days: number;
  }[];
  deployments: EquipmentDeployment[];
  byType: { type: 'possede' | 'loue'; amount: number }[];
  distinctMateriels: number;
}

export async function getLaborBreakdown(chantierId: string): Promise<LaborBreakdown> {
  const orgId = getActiveOrgId();
  const [att, workers] = await Promise.all([
    fetchAttendance(orgId, chantierId),
    fetchWorkerInfo(orgId),
  ]);

  const dailyMap = new Map<string, number>();
  const workerMap = new Map<string, { amount: number; days: number }>();
  let totalDaysWorked = 0;
  let totalPrimes = 0;

  for (const a of att) {
    const rate = workers.get(a.worker_id)?.rate ?? 0;
    let amount = 0;
    if (a.status === 'P') {
      amount += rate;
      totalDaysWorked += 1;
      const ws = workerMap.get(a.worker_id) ?? { amount: 0, days: 0 };
      ws.amount += rate;
      ws.days += 1;
      workerMap.set(a.worker_id, ws);
    }
    const prime = Number(a.prime_amount) || 0;
    if (prime > 0) {
      amount += prime;
      totalPrimes += prime;
      const ws = workerMap.get(a.worker_id) ?? { amount: 0, days: 0 };
      ws.amount += prime;
      workerMap.set(a.worker_id, ws);
    }
    if (amount > 0) {
      dailyMap.set(
        a.attendance_date,
        (dailyMap.get(a.attendance_date) ?? 0) + amount
      );
    }
  }

  const daily: DailyPoint[] = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }));

  const byWorker = [...workerMap.entries()]
    .map(([worker_id, v]) => ({
      worker_id,
      name: workers.get(worker_id)?.name ?? '—',
      amount: Math.round(v.amount * 100) / 100,
      days: v.days,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    daily,
    byWorker,
    totalDaysWorked,
    totalPrimes: Math.round(totalPrimes * 100) / 100,
  };
}

export async function getMaterialsBreakdown(
  chantierId: string
): Promise<MaterialsBreakdown> {
  const orgId = getActiveOrgId();
  const [cons, items] = await Promise.all([
    fetchConsumption(orgId, chantierId),
    fetchItemInfo(orgId),
  ]);

  const dailyMap = new Map<string, number>();
  const itemMap = new Map<string, { amount: number; qty: number }>();

  for (const c of cons) {
    const price = items.get(c.item_id)?.price ?? 0;
    const qty = Number(c.qty) || 0;
    const amount = qty * price;
    if (amount > 0) {
      dailyMap.set(c.used_at, (dailyMap.get(c.used_at) ?? 0) + amount);
    }
    const ws = itemMap.get(c.item_id) ?? { amount: 0, qty: 0 };
    ws.amount += amount;
    ws.qty += qty;
    itemMap.set(c.item_id, ws);
  }

  const daily: DailyPoint[] = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }));

  const byItem = [...itemMap.entries()]
    .map(([item_id, v]) => ({
      item_id,
      name: items.get(item_id)?.name ?? '—',
      amount: Math.round(v.amount * 100) / 100,
      qty: Math.round(v.qty * 100) / 100,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    daily,
    byItem,
    distinctItems: itemMap.size,
    events: cons.length,
  };
}

export async function getEquipmentBreakdown(
  chantierId: string
): Promise<EquipmentBreakdown> {
  const orgId = getActiveOrgId();
  const [deployments, materiels] = await Promise.all([
    fetchDeployments(orgId, chantierId),
    fetchMaterielInfo(orgId),
  ]);

  const materielMap = new Map<string, { amount: number; days: number }>();
  const typeAmount: Record<'possede' | 'loue', number> = { possede: 0, loue: 0 };
  const deploymentsOut: EquipmentDeployment[] = [];

  for (const d of deployments) {
    const m = materiels.get(d.materiel_id);
    const rate = m?.cost_per_day ?? 0;
    const amount = deploymentCost(d, rate);
    const days = deploymentDays(d.start_date, d.end_date);

    const ws = materielMap.get(d.materiel_id) ?? { amount: 0, days: 0 };
    ws.amount += amount;
    ws.days += days;
    materielMap.set(d.materiel_id, ws);

    if (m) typeAmount[m.type] += amount;

    deploymentsOut.push({
      materiel_id: d.materiel_id,
      name: m?.name ?? '—',
      start: d.start_date,
      end: d.end_date,
      amount: Math.round(amount * 100) / 100,
    });
  }

  const byMateriel = [...materielMap.entries()]
    .map(([materiel_id, v]) => ({
      materiel_id,
      name: materiels.get(materiel_id)?.name ?? '—',
      amount: Math.round(v.amount * 100) / 100,
      days: v.days,
    }))
    .sort((a, b) => b.amount - a.amount);

  const byType = (['possede', 'loue'] as const).map((t) => ({
    type: t,
    amount: Math.round(typeAmount[t] * 100) / 100,
  }));

  return {
    byMateriel,
    deployments: deploymentsOut.sort((a, b) => a.start.localeCompare(b.start)),
    byType,
    distinctMateriels: materielMap.size,
  };
}
