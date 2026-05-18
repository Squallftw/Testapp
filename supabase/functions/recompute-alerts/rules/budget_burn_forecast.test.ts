// supabase/functions/recompute-alerts/rules/budget_burn_forecast.test.ts
import { assertEquals } from 'std/assert/mod.ts';
import { computeBudgetBurnForecast } from './budget_burn_forecast.ts';

Deno.test('budget_burn_forecast: fires as warning when projected 100-110%', () => {
  // 31 days elapsed of 62 → spent 52k extrapolated to 104k → 104% of 100k budget.
  const today = '2026-05-18';
  const result = computeBudgetBurnForecast({
    today,
    chantiers: [{
      id: 'c1', name: 'Villa', date_start: '2026-04-18', date_end_prev: '2026-06-18',
      budget_total: 100_000, total_spent: 52_000, status: 'active',
    }],
  });
  assertEquals(result.length, 1);
  assertEquals(result[0].kind, 'budget_burn_forecast');
  assertEquals(result[0].severity, 'warning');
  assertEquals(result[0].fingerprint, 'budget_burn_forecast:c1');
});

Deno.test('budget_burn_forecast: critical when projected > 110%', () => {
  // 31 days elapsed of 62 → spent 60k extrapolated to 120k → 120% of 100k budget.
  const today = '2026-05-18';
  const result = computeBudgetBurnForecast({
    today,
    chantiers: [{
      id: 'c1', name: 'Villa', date_start: '2026-04-18', date_end_prev: '2026-06-18',
      budget_total: 100_000, total_spent: 60_000, status: 'active',
    }],
  });
  assertEquals(result[0].severity, 'critical');
});

Deno.test('budget_burn_forecast: skips chantier <7 days elapsed', () => {
  const today = '2026-05-18';
  const result = computeBudgetBurnForecast({
    today,
    chantiers: [{
      id: 'c1', name: 'Villa', date_start: '2026-05-15', date_end_prev: '2026-08-15',
      budget_total: 100_000, total_spent: 50_000, status: 'active',
    }],
  });
  assertEquals(result.length, 0);
});

Deno.test('budget_burn_forecast: skips chantier >95% through timeline', () => {
  const today = '2026-05-18';
  const result = computeBudgetBurnForecast({
    today,
    chantiers: [{
      id: 'c1', name: 'Villa',
      date_start: '2026-01-01', date_end_prev: '2026-05-20',
      budget_total: 100_000, total_spent: 200_000, status: 'active',
    }],
  });
  assertEquals(result.length, 0);
});

Deno.test('budget_burn_forecast: skips inactive chantier', () => {
  const today = '2026-05-18';
  const result = computeBudgetBurnForecast({
    today,
    chantiers: [{
      id: 'c1', name: 'Atelier',
      date_start: '2026-01-01', date_end_prev: '2026-04-01',
      budget_total: 100_000, total_spent: 200_000, status: 'completed',
    }],
  });
  assertEquals(result.length, 0);
});

Deno.test('budget_burn_forecast: skips chantier without dates', () => {
  const today = '2026-05-18';
  const result = computeBudgetBurnForecast({
    today,
    chantiers: [{
      id: 'c1', name: 'Villa', date_start: null, date_end_prev: '2026-08-15',
      budget_total: 100_000, total_spent: 50_000, status: 'active',
    }],
  });
  assertEquals(result.length, 0);
});

Deno.test('budget_burn_forecast: skips chantier with zero budget', () => {
  const today = '2026-05-18';
  const result = computeBudgetBurnForecast({
    today,
    chantiers: [{
      id: 'c1', name: 'Villa', date_start: '2026-04-01', date_end_prev: '2026-07-01',
      budget_total: 0, total_spent: 50_000, status: 'active',
    }],
  });
  assertEquals(result.length, 0);
});
