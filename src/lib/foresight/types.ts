/**
 * Foresight engine — type contracts.
 *
 * All inputs are plain values (dates as ISO yyyy-mm-dd strings, numbers in MAD).
 * Pure compute, no DB types — the DAL layer in src/data/foresight.ts adapts
 * Supabase rows into these shapes.
 */

// ── Cost projection ────────────────────────────────────────────────────

export interface CostProjectionInput {
  /** Chantier start date (ISO yyyy-mm-dd). null if not set. */
  dateStart: string | null;
  /** Chantier planned end date (ISO yyyy-mm-dd). null if not set. */
  dateEndPrev: string | null;
  /** Total budget in MAD. */
  budgetTotal: number;
  /** Total spent so far in MAD (sum of labor + materials + equipment). */
  totalSpent: number;
  /** Anchor "today" as ISO yyyy-mm-dd (passed in for testability). */
  today: string;
}

export type CostProjection =
  | {
      kind: 'ok';
      /** Projected final cost in MAD at current burn rate. */
      projected: number;
      /** Total budget in MAD (echoed for convenience). */
      budget: number;
      /** Variance as fraction of budget: (projected - budget) / budget. */
      variancePct: number;
      daysElapsed: number;
      daysTotal: number;
    }
  | {
      kind: 'insufficient';
      reason: 'no_dates' | 'no_budget' | 'too_early' | 'invalid_dates';
    };

// ── Schedule projection ────────────────────────────────────────────────

export interface ScheduleTaskInput {
  /** Status; only 'done' counts as completed. */
  status: 'todo' | 'ongoing' | 'done' | 'critical';
  /** Duration in days, used as the weight of the task. null → weight 0. */
  durationDays: number | null;
}

export interface ScheduleProjectionInput {
  dateStart: string | null;
  dateEndPrev: string | null;
  today: string;
  tasks: ScheduleTaskInput[];
}

export type ScheduleProjection =
  | {
      kind: 'ok';
      /** ISO yyyy-mm-dd. Projected actual completion date. */
      projectedEndDate: string;
      /** ISO yyyy-mm-dd. Originally planned end. */
      plannedEndDate: string;
      /** projectedEndDate - plannedEndDate in days (positive = late). */
      deltaDays: number;
      /**
       * Schedule adherence: completedWeight / expectedWeightByNow.
       * 1.0 = on track, < 1 = behind, > 1 = ahead.
       */
      scheduleAdherencePct: number;
    }
  | {
      kind: 'insufficient';
      reason: 'no_dates' | 'no_tasks' | 'no_velocity' | 'too_early' | 'invalid_dates';
    };

// ── Risk score ─────────────────────────────────────────────────────────

export type RiskLevel = 'green' | 'yellow' | 'red';

export type RiskDriverKind =
  | 'cost_variance'
  | 'schedule_delay'
  | 'critical_alert'
  | 'warning_alert'
  | 'low_stock'
  | 'overdue_payment'
  | 'cash_negative';

export interface RiskDriver {
  kind: RiskDriverKind;
  severity: 'info' | 'warning' | 'critical';
  /** French, user-facing one-liner shown in the drivers list. */
  message: string;
}

export interface RiskScoreInput {
  cost: CostProjection;
  schedule: ScheduleProjection;
  /** Active alert counts by severity from the alerts table. */
  alerts: { critical: number; warning: number; info: number };
  /** Consumables on this chantier currently below their reorder threshold. */
  lowStockCount: number;
  /** Payments overdue (date > today, unpaid). 0 until due_date migration lands. */
  overduePaymentCount: number;
  /** Cash position: payments_received - total_spent. Negative is bad. */
  cashPosition: number;
}

export interface RiskScore {
  level: RiskLevel;
  drivers: RiskDriver[];
}

// ── Engine output ──────────────────────────────────────────────────────

export interface ChantierForesightInput {
  chantierId: string;
  chantierName: string;
  cost: CostProjectionInput;
  schedule: ScheduleProjectionInput;
  alerts: RiskScoreInput['alerts'];
  lowStockCount: number;
  overduePaymentCount: number;
  cashPosition: number;
}

export interface ChantierForesight {
  chantierId: string;
  chantierName: string;
  cost: CostProjection;
  schedule: ScheduleProjection;
  risk: RiskScore;
}

export interface OrgForesight {
  /** Per-chantier results, same order as input. */
  chantiers: ChantierForesight[];
  /** Σ projected − Σ budget, considering only 'ok' cost projections. */
  portfolioVariance: number;
  /** Σ budget over chantiers with 'ok' cost projection. */
  portfolioBudget: number;
  /** Average schedule adherence across chantiers with 'ok' schedule. NaN if none. */
  avgScheduleAdherence: number;
  /** Count of chantiers at each risk level. */
  riskCounts: Record<RiskLevel, number>;
}
