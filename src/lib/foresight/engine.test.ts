import { describe, expect, it } from 'vitest';
import { computeChantierForesight, computeOrgForesight } from './engine';
import type { ChantierForesightInput } from './types';

function makeInput(
  overrides: Partial<ChantierForesightInput> = {}
): ChantierForesightInput {
  return {
    chantierId: 'c1',
    chantierName: 'Chantier 1',
    cost: {
      dateStart: '2026-01-01',
      dateEndPrev: '2026-04-10',
      budgetTotal: 100_000,
      totalSpent: 60_000,
      today: '2026-02-19',
    },
    schedule: {
      dateStart: '2026-01-01',
      dateEndPrev: '2026-04-10',
      today: '2026-02-19',
      tasks: [
        ...Array.from({ length: 5 }, () => ({
          status: 'done' as const,
          durationDays: 10,
        })),
        ...Array.from({ length: 5 }, () => ({
          status: 'todo' as const,
          durationDays: 10,
        })),
      ],
    },
    alerts: { critical: 0, warning: 0, info: 0 },
    lowStockCount: 0,
    overduePaymentCount: 0,
    cashPosition: 50_000,
    ...overrides,
  };
}

describe('computeChantierForesight', () => {
  it('combines cost, schedule, and risk for one chantier', () => {
    const result = computeChantierForesight(makeInput());
    expect(result.chantierId).toBe('c1');
    expect(result.chantierName).toBe('Chantier 1');
    expect(result.cost.kind).toBe('ok');
    expect(result.schedule.kind).toBe('ok');
    expect(result.risk.level).toBe('red'); // cost projected to 120k = +20% → critical
  });
});

describe('computeOrgForesight', () => {
  it('aggregates portfolio variance and budget across ok chantiers', () => {
    const a = makeInput({ chantierId: 'a', chantierName: 'A' }); // projected 120k, budget 100k → variance +20k
    const b = makeInput({
      chantierId: 'b',
      chantierName: 'B',
      cost: {
        dateStart: '2026-01-01',
        dateEndPrev: '2026-04-10',
        budgetTotal: 200_000,
        totalSpent: 90_000, // projected 180k, budget 200k → variance -20k
        today: '2026-02-19',
      },
    });

    const result = computeOrgForesight([a, b]);

    expect(result.portfolioBudget).toBe(300_000); // 100k + 200k
    expect(result.portfolioVariance).toBe(0); // +20k + (-20k)
    expect(result.chantiers).toHaveLength(2);
  });

  it('excludes chantiers with insufficient cost projection from portfolio totals', () => {
    const ok = makeInput({ chantierId: 'ok' });
    const tooEarly = makeInput({
      chantierId: 'too_early',
      cost: {
        dateStart: '2026-02-15',
        dateEndPrev: '2026-04-10',
        budgetTotal: 50_000,
        totalSpent: 1_000,
        today: '2026-02-19', // only 5 days in
      },
    });

    const result = computeOrgForesight([ok, tooEarly]);

    expect(result.portfolioBudget).toBe(100_000); // only the ok one counts
    expect(result.portfolioVariance).toBe(20_000);
  });

  it('counts chantiers by risk level', () => {
    // Green: no variance, no delta, no issues
    const green = makeInput({
      chantierId: 'g',
      cost: {
        dateStart: '2026-01-01',
        dateEndPrev: '2026-04-10',
        budgetTotal: 100_000,
        totalSpent: 50_000, // projected 100k → 0% variance
        today: '2026-02-19',
      },
    });
    // Red: 1 critical alert
    const red = makeInput({
      chantierId: 'r',
      alerts: { critical: 1, warning: 0, info: 0 },
    });

    const result = computeOrgForesight([green, red]);

    expect(result.riskCounts.green).toBe(1);
    expect(result.riskCounts.red).toBe(1);
    expect(result.riskCounts.yellow).toBe(0);
  });

  it('computes average schedule adherence across ok schedules only', () => {
    const onTrack = makeInput({ chantierId: 'on' }); // adherence 1.0
    const noTasks = makeInput({
      chantierId: 'nt',
      schedule: {
        dateStart: '2026-01-01',
        dateEndPrev: '2026-04-10',
        today: '2026-02-19',
        tasks: [],
      },
    });

    const result = computeOrgForesight([onTrack, noTasks]);

    expect(result.avgScheduleAdherence).toBeCloseTo(1.0, 5);
  });
});
