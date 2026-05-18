import { assertEquals } from 'std/assert/mod.ts';
import { computeTaskOverdue } from './task_overdue.ts';

Deno.test('task_overdue: fires when task end < today and not done', () => {
  // start 5-01 + (10-1) days = ends 5-10, today 5-18 → 8 days late → critical.
  const result = computeTaskOverdue({
    today: '2026-05-18',
    tasks: [{
      id: 't1', label: 'Fondations', chantier_id: 'c1', chantier_name: 'Villa',
      chantier_status: 'active',
      start_date: '2026-05-01', duration_days: 10, status: 'ongoing',
    }],
  });
  assertEquals(result.length, 1);
  assertEquals(result[0].severity, 'critical');
  assertEquals((result[0].payload as { days_late: number }).days_late, 8);
});

Deno.test('task_overdue: info severity 1-2 days late', () => {
  // start 5-09 + (8-1) = ends 5-16, today 5-18 → 2 days late → info.
  const result = computeTaskOverdue({
    today: '2026-05-18',
    tasks: [{
      id: 't1', label: 'Murs', chantier_id: 'c1', chantier_name: 'Villa',
      chantier_status: 'active',
      start_date: '2026-05-09', duration_days: 8, status: 'ongoing',
    }],
  });
  assertEquals(result[0].severity, 'info');
});

Deno.test('task_overdue: warning 3-7 days late', () => {
  // start 5-03 + (11-1) = ends 5-13, today 5-18 → 5 days late → warning.
  const result = computeTaskOverdue({
    today: '2026-05-18',
    tasks: [{
      id: 't1', label: 'Murs', chantier_id: 'c1', chantier_name: 'Villa',
      chantier_status: 'active',
      start_date: '2026-05-03', duration_days: 11, status: 'ongoing',
    }],
  });
  assertEquals(result[0].severity, 'warning');
});

Deno.test('task_overdue: skips done task', () => {
  const result = computeTaskOverdue({
    today: '2026-05-18',
    tasks: [{
      id: 't1', label: 'Fondations', chantier_id: 'c1', chantier_name: 'Villa',
      chantier_status: 'active',
      start_date: '2026-05-01', duration_days: 10, status: 'done',
    }],
  });
  assertEquals(result.length, 0);
});

Deno.test('task_overdue: skips when chantier inactive', () => {
  const result = computeTaskOverdue({
    today: '2026-05-18',
    tasks: [{
      id: 't1', label: 'Fondations', chantier_id: 'c1', chantier_name: 'Atelier',
      chantier_status: 'completed',
      start_date: '2026-05-01', duration_days: 10, status: 'ongoing',
    }],
  });
  assertEquals(result.length, 0);
});

Deno.test('task_overdue: skips on-time task', () => {
  const result = computeTaskOverdue({
    today: '2026-05-18',
    tasks: [{
      id: 't1', label: 'Fondations', chantier_id: 'c1', chantier_name: 'Villa',
      chantier_status: 'active',
      start_date: '2026-05-10', duration_days: 20, status: 'ongoing',
    }],
  });
  assertEquals(result.length, 0);
});
