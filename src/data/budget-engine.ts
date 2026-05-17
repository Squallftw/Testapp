import { todo } from './errors';

export interface DateRange {
  start: string; // ISO yyyy-mm-dd
  end: string;
}

export interface BudgetSummary {
  chantier_id: string;
  labor_spent: number;
  equipment_spent: number;
  materials_spent: number;
  payments_received: number;
  total_spent: number;
  remaining: number; // budget_total - total_spent
}

/**
 * Labor cost in MAD for a chantier in a date range.
 * Matches the legacy formula:
 *   SUM(days × daily_rate) + SUM(prime_amount)
 * over attendance.status='P' rows (via labor_entries materialised view).
 */
export async function laborSpent(chantierId: string, range?: DateRange): Promise<number> {
  return todo('budget.laborSpent', chantierId, range);
}

export async function equipmentSpent(chantierId: string, range?: DateRange): Promise<number> {
  return todo('budget.equipmentSpent', chantierId, range);
}

export async function materialsSpent(chantierId: string, range?: DateRange): Promise<number> {
  return todo('budget.materialsSpent', chantierId, range);
}

export async function paymentsReceived(chantierId: string, range?: DateRange): Promise<number> {
  return todo('budget.paymentsReceived', chantierId, range);
}

/** One round-trip query returning all four numbers + derived totals. */
export async function getSummary(chantierId: string, range?: DateRange): Promise<BudgetSummary> {
  return todo('budget.getSummary', chantierId, range);
}

/** Multi-chantier dashboard view: one summary per chantier. */
export async function getSummariesForOrg(range?: DateRange): Promise<BudgetSummary[]> {
  return todo('budget.getSummariesForOrg', range);
}
