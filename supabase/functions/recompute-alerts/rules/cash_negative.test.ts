import { assertEquals } from 'std/assert/mod.ts';
import { computeCashNegative } from './cash_negative.ts';

Deno.test('cash_negative: fires when received < 70% of spent past day 14', () => {
  const result = computeCashNegative({
    today: '2026-05-18',
    chantiers: [{
      id: 'c1', name: 'Villa', status: 'active', date_start: '2026-04-15',
      total_spent: 100_000, payments_received: 50_000,
    }],
  });
  assertEquals(result.length, 1);
  assertEquals(result[0].severity, 'warning');
  assertEquals((result[0].payload as { deficit: number }).deficit, 50_000);
});

Deno.test('cash_negative: skips chantier <14 days since start', () => {
  const result = computeCashNegative({
    today: '2026-05-18',
    chantiers: [{
      id: 'c1', name: 'Villa', status: 'active', date_start: '2026-05-10',
      total_spent: 50_000, payments_received: 0,
    }],
  });
  assertEquals(result.length, 0);
});

Deno.test('cash_negative: skips when received >= 70% of spent', () => {
  const result = computeCashNegative({
    today: '2026-05-18',
    chantiers: [{
      id: 'c1', name: 'Villa', status: 'active', date_start: '2026-04-15',
      total_spent: 100_000, payments_received: 80_000,
    }],
  });
  assertEquals(result.length, 0);
});

Deno.test('cash_negative: skips when total_spent = 0', () => {
  const result = computeCashNegative({
    today: '2026-05-18',
    chantiers: [{
      id: 'c1', name: 'Villa', status: 'active', date_start: '2026-04-15',
      total_spent: 0, payments_received: 0,
    }],
  });
  assertEquals(result.length, 0);
});

Deno.test('cash_negative: skips inactive chantier', () => {
  const result = computeCashNegative({
    today: '2026-05-18',
    chantiers: [{
      id: 'c1', name: 'Atelier', status: 'completed', date_start: '2026-01-01',
      total_spent: 100_000, payments_received: 30_000,
    }],
  });
  assertEquals(result.length, 0);
});
