import { describe, expect, it } from 'vitest';
import { projectSchedule } from './schedule-projection';

describe('projectSchedule', () => {
  it('projects on-track end date when velocity matches plan', () => {
    // 50 days into a 100-day chantier. 5 of 10 tasks done, each 10 days.
    // → done weight 50, total weight 100, velocity 1 weight/day,
    //   remaining weight 50 → 50 more days → projected end = planned end.
    const tasks = [
      ...Array.from({ length: 5 }, () => ({ status: 'done' as const, durationDays: 10 })),
      ...Array.from({ length: 5 }, () => ({ status: 'todo' as const, durationDays: 10 })),
    ];

    const result = projectSchedule({
      dateStart: '2026-01-01',
      dateEndPrev: '2026-04-10',
      today: '2026-02-19',
      tasks,
    });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.projectedEndDate).toBe('2026-04-10');
    expect(result.plannedEndDate).toBe('2026-04-10');
    expect(result.deltaDays).toBe(0);
    expect(result.scheduleAdherencePct).toBeCloseTo(1.0, 5);
  });

  it('returns insufficient/no_dates when start or end is missing', () => {
    const tasks = [{ status: 'done' as const, durationDays: 10 }];
    expect(
      projectSchedule({
        dateStart: null,
        dateEndPrev: '2026-04-10',
        today: '2026-02-19',
        tasks,
      })
    ).toEqual({ kind: 'insufficient', reason: 'no_dates' });

    expect(
      projectSchedule({
        dateStart: '2026-01-01',
        dateEndPrev: null,
        today: '2026-02-19',
        tasks,
      })
    ).toEqual({ kind: 'insufficient', reason: 'no_dates' });
  });

  it('returns insufficient/no_tasks when there are no tasks with weight', () => {
    // No tasks at all
    expect(
      projectSchedule({
        dateStart: '2026-01-01',
        dateEndPrev: '2026-04-10',
        today: '2026-02-19',
        tasks: [],
      })
    ).toEqual({ kind: 'insufficient', reason: 'no_tasks' });

    // Tasks exist but all have null/0 duration → total weight is 0
    expect(
      projectSchedule({
        dateStart: '2026-01-01',
        dateEndPrev: '2026-04-10',
        today: '2026-02-19',
        tasks: [
          { status: 'todo', durationDays: null },
          { status: 'done', durationDays: 0 },
        ],
      })
    ).toEqual({ kind: 'insufficient', reason: 'no_tasks' });
  });

  it('returns insufficient/no_velocity when no tasks are done yet', () => {
    const tasks = Array.from({ length: 10 }, () => ({
      status: 'todo' as const,
      durationDays: 10,
    }));
    expect(
      projectSchedule({
        dateStart: '2026-01-01',
        dateEndPrev: '2026-04-10',
        today: '2026-02-19',
        tasks,
      })
    ).toEqual({ kind: 'insufficient', reason: 'no_velocity' });
  });

  it('returns insufficient/too_early when fewer than 7 days have elapsed', () => {
    const tasks = [{ status: 'done' as const, durationDays: 10 }];
    expect(
      projectSchedule({
        dateStart: '2026-01-01',
        dateEndPrev: '2026-04-10',
        today: '2026-01-05',
        tasks,
      })
    ).toEqual({ kind: 'insufficient', reason: 'too_early' });
  });

  it('returns insufficient/invalid_dates when end is before start', () => {
    const tasks = [{ status: 'done' as const, durationDays: 10 }];
    expect(
      projectSchedule({
        dateStart: '2026-04-10',
        dateEndPrev: '2026-01-01',
        today: '2026-02-19',
        tasks,
      })
    ).toEqual({ kind: 'insufficient', reason: 'invalid_dates' });
  });

  it('projects late finish when velocity is below plan', () => {
    // 50 days into 100. Only 30% weight done → adherence 0.6, projected late.
    const tasks = [
      ...Array.from({ length: 3 }, () => ({ status: 'done' as const, durationDays: 10 })),
      ...Array.from({ length: 7 }, () => ({ status: 'todo' as const, durationDays: 10 })),
    ];
    const result = projectSchedule({
      dateStart: '2026-01-01',
      dateEndPrev: '2026-04-10',
      today: '2026-02-19',
      tasks,
    });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.scheduleAdherencePct).toBeCloseTo(0.6, 5);
    expect(result.deltaDays).toBeGreaterThan(0);
  });
});
