import { describe, expect, it } from 'vitest';
import { projectCost } from './cost-projection';

describe('projectCost', () => {
  it('projects final cost by linear extrapolation of burn rate', () => {
    // 50 days into a 100-day chantier, 60% of budget consumed
    // → straight-line projection: 60k × (100 / 50) = 120k → +20% variance
    const result = projectCost({
      dateStart: '2026-01-01',
      dateEndPrev: '2026-04-10', // 100 days inclusive of start (Jan has 31, Feb 28, Mar 31, Apr 10 → 31+28+31+10 = 100)
      budgetTotal: 100_000,
      totalSpent: 60_000,
      today: '2026-02-19', // 50 days after Jan 1 inclusive
    });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.projected).toBe(120_000);
    expect(result.budget).toBe(100_000);
    expect(result.variancePct).toBeCloseTo(0.2, 5);
    expect(result.daysElapsed).toBe(50);
    expect(result.daysTotal).toBe(100);
  });

  it('returns insufficient/no_dates when start or end is missing', () => {
    const missingStart = projectCost({
      dateStart: null,
      dateEndPrev: '2026-04-10',
      budgetTotal: 100_000,
      totalSpent: 60_000,
      today: '2026-02-19',
    });
    expect(missingStart).toEqual({ kind: 'insufficient', reason: 'no_dates' });

    const missingEnd = projectCost({
      dateStart: '2026-01-01',
      dateEndPrev: null,
      budgetTotal: 100_000,
      totalSpent: 60_000,
      today: '2026-02-19',
    });
    expect(missingEnd).toEqual({ kind: 'insufficient', reason: 'no_dates' });
  });

  it('returns insufficient/no_budget when budgetTotal is zero or negative', () => {
    const result = projectCost({
      dateStart: '2026-01-01',
      dateEndPrev: '2026-04-10',
      budgetTotal: 0,
      totalSpent: 60_000,
      today: '2026-02-19',
    });
    expect(result).toEqual({ kind: 'insufficient', reason: 'no_budget' });
  });

  it('returns insufficient/invalid_dates when end is before or equal to start', () => {
    const result = projectCost({
      dateStart: '2026-04-10',
      dateEndPrev: '2026-01-01',
      budgetTotal: 100_000,
      totalSpent: 60_000,
      today: '2026-02-19',
    });
    expect(result).toEqual({ kind: 'insufficient', reason: 'invalid_dates' });
  });

  it('returns insufficient/too_early when fewer than 7 days have elapsed', () => {
    const result = projectCost({
      dateStart: '2026-01-01',
      dateEndPrev: '2026-04-10',
      budgetTotal: 100_000,
      totalSpent: 5_000,
      today: '2026-01-05', // only 5 days in
    });
    expect(result).toEqual({ kind: 'insufficient', reason: 'too_early' });
  });
});
