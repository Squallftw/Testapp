import { describe, expect, it } from 'vitest';
import { computeRisk } from './risk-score';
import type { CostProjection, ScheduleProjection } from './types';

function okCost(overrides: Partial<Extract<CostProjection, { kind: 'ok' }>> = {}): CostProjection {
  return {
    kind: 'ok',
    projected: 100_000,
    budget: 100_000,
    variancePct: 0,
    daysElapsed: 50,
    daysTotal: 100,
    ...overrides,
  };
}

function okSchedule(
  overrides: Partial<Extract<ScheduleProjection, { kind: 'ok' }>> = {}
): ScheduleProjection {
  return {
    kind: 'ok',
    projectedEndDate: '2026-04-10',
    plannedEndDate: '2026-04-10',
    deltaDays: 0,
    scheduleAdherencePct: 1.0,
    ...overrides,
  };
}

describe('computeRisk', () => {
  it('returns green when cost on-budget, schedule on-time, no alerts/issues', () => {
    const risk = computeRisk({
      cost: okCost(),
      schedule: okSchedule(),
      alerts: { critical: 0, warning: 0, info: 0 },
      lowStockCount: 0,
      overduePaymentCount: 0,
      cashPosition: 50_000,
    });

    expect(risk.level).toBe('green');
    expect(risk.drivers).toEqual([]);
  });

  it('yellow when cost variance is between 5% and 15%', () => {
    const risk = computeRisk({
      cost: okCost({ variancePct: 0.08, projected: 108_000 }),
      schedule: okSchedule(),
      alerts: { critical: 0, warning: 0, info: 0 },
      lowStockCount: 0,
      overduePaymentCount: 0,
      cashPosition: 50_000,
    });
    expect(risk.level).toBe('yellow');
    expect(risk.drivers.map((d) => d.kind)).toContain('cost_variance');
    expect(risk.drivers.find((d) => d.kind === 'cost_variance')?.severity).toBe('warning');
  });

  it('red when cost variance is 15% or more', () => {
    const risk = computeRisk({
      cost: okCost({ variancePct: 0.2, projected: 120_000 }),
      schedule: okSchedule(),
      alerts: { critical: 0, warning: 0, info: 0 },
      lowStockCount: 0,
      overduePaymentCount: 0,
      cashPosition: 50_000,
    });
    expect(risk.level).toBe('red');
    expect(risk.drivers.find((d) => d.kind === 'cost_variance')?.severity).toBe('critical');
  });

  it('yellow when schedule delta is between 5 and 14 days late', () => {
    const risk = computeRisk({
      cost: okCost(),
      schedule: okSchedule({ deltaDays: 10, projectedEndDate: '2026-04-20' }),
      alerts: { critical: 0, warning: 0, info: 0 },
      lowStockCount: 0,
      overduePaymentCount: 0,
      cashPosition: 50_000,
    });
    expect(risk.level).toBe('yellow');
    expect(risk.drivers.find((d) => d.kind === 'schedule_delay')?.severity).toBe('warning');
  });

  it('red when schedule delta is 15+ days late', () => {
    const risk = computeRisk({
      cost: okCost(),
      schedule: okSchedule({ deltaDays: 20, projectedEndDate: '2026-04-30' }),
      alerts: { critical: 0, warning: 0, info: 0 },
      lowStockCount: 0,
      overduePaymentCount: 0,
      cashPosition: 50_000,
    });
    expect(risk.level).toBe('red');
    expect(risk.drivers.find((d) => d.kind === 'schedule_delay')?.severity).toBe('critical');
  });

  it('yellow when there is exactly one warning alert', () => {
    const risk = computeRisk({
      cost: okCost(),
      schedule: okSchedule(),
      alerts: { critical: 0, warning: 1, info: 0 },
      lowStockCount: 0,
      overduePaymentCount: 0,
      cashPosition: 50_000,
    });
    expect(risk.level).toBe('yellow');
    expect(risk.drivers.find((d) => d.kind === 'warning_alert')).toBeDefined();
  });

  it('red when there is a critical alert', () => {
    const risk = computeRisk({
      cost: okCost(),
      schedule: okSchedule(),
      alerts: { critical: 1, warning: 0, info: 0 },
      lowStockCount: 0,
      overduePaymentCount: 0,
      cashPosition: 50_000,
    });
    expect(risk.level).toBe('red');
    expect(risk.drivers.find((d) => d.kind === 'critical_alert')).toBeDefined();
  });

  it('red when cash position is negative', () => {
    const risk = computeRisk({
      cost: okCost(),
      schedule: okSchedule(),
      alerts: { critical: 0, warning: 0, info: 0 },
      lowStockCount: 0,
      overduePaymentCount: 0,
      cashPosition: -5_000,
    });
    expect(risk.level).toBe('red');
    expect(risk.drivers.find((d) => d.kind === 'cash_negative')).toBeDefined();
  });

  it('yellow when consumables are below reorder threshold', () => {
    const risk = computeRisk({
      cost: okCost(),
      schedule: okSchedule(),
      alerts: { critical: 0, warning: 0, info: 0 },
      lowStockCount: 3,
      overduePaymentCount: 0,
      cashPosition: 50_000,
    });
    expect(risk.level).toBe('yellow');
    expect(risk.drivers.find((d) => d.kind === 'low_stock')).toBeDefined();
  });

  it('yellow when payments are overdue', () => {
    const risk = computeRisk({
      cost: okCost(),
      schedule: okSchedule(),
      alerts: { critical: 0, warning: 0, info: 0 },
      lowStockCount: 0,
      overduePaymentCount: 2,
      cashPosition: 50_000,
    });
    expect(risk.level).toBe('yellow');
    expect(risk.drivers.find((d) => d.kind === 'overdue_payment')).toBeDefined();
  });

  it('skips cost and schedule drivers when projections are insufficient', () => {
    const risk = computeRisk({
      cost: { kind: 'insufficient', reason: 'too_early' },
      schedule: { kind: 'insufficient', reason: 'no_velocity' },
      alerts: { critical: 0, warning: 0, info: 0 },
      lowStockCount: 0,
      overduePaymentCount: 0,
      cashPosition: 50_000,
    });
    expect(risk.level).toBe('green');
    expect(risk.drivers).toEqual([]);
  });

  it('combines multiple drivers and picks the highest level', () => {
    const risk = computeRisk({
      cost: okCost({ variancePct: 0.08 }),
      schedule: okSchedule({ deltaDays: 10 }),
      alerts: { critical: 1, warning: 2, info: 0 },
      lowStockCount: 1,
      overduePaymentCount: 1,
      cashPosition: 50_000,
    });
    expect(risk.level).toBe('red'); // critical alert dominates
    const kinds = risk.drivers.map((d) => d.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        'cost_variance',
        'schedule_delay',
        'critical_alert',
        'warning_alert',
        'low_stock',
        'overdue_payment',
      ])
    );
  });
});
