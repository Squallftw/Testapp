// supabase/functions/recompute-alerts/rules/chantier_overdue.test.ts
import { assertEquals } from 'std/assert/mod.ts';
import { computeChantierOverdue } from './chantier_overdue.ts';

Deno.test('chantier_overdue: fires when date_end_prev passed and active', () => {
  const result = computeChantierOverdue({
    today: '2026-05-18',
    chantiers: [{
      id: 'c1', name: 'Villa', status: 'active', date_end_prev: '2026-05-15',
    }],
  });
  assertEquals(result.length, 1);
  assertEquals(result[0].severity, 'warning');  // 3 days late
  assertEquals((result[0].payload as { days_late: number }).days_late, 3);
});

Deno.test('chantier_overdue: critical when > 7 days late', () => {
  const result = computeChantierOverdue({
    today: '2026-05-18',
    chantiers: [{
      id: 'c1', name: 'Villa', status: 'active', date_end_prev: '2026-05-01',
    }],
  });
  assertEquals(result[0].severity, 'critical');
});

Deno.test('chantier_overdue: skips on-time chantier', () => {
  const result = computeChantierOverdue({
    today: '2026-05-18',
    chantiers: [{
      id: 'c1', name: 'Villa', status: 'active', date_end_prev: '2026-06-18',
    }],
  });
  assertEquals(result.length, 0);
});

Deno.test('chantier_overdue: skips inactive chantier', () => {
  const result = computeChantierOverdue({
    today: '2026-05-18',
    chantiers: [{
      id: 'c1', name: 'Villa', status: 'completed', date_end_prev: '2026-05-01',
    }],
  });
  assertEquals(result.length, 0);
});

Deno.test('chantier_overdue: skips chantier without date_end_prev', () => {
  const result = computeChantierOverdue({
    today: '2026-05-18',
    chantiers: [{
      id: 'c1', name: 'Villa', status: 'active', date_end_prev: null,
    }],
  });
  assertEquals(result.length, 0);
});
