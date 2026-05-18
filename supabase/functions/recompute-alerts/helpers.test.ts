// supabase/functions/recompute-alerts/helpers.test.ts
import { assertEquals } from 'std/assert/mod.ts';
import { daysBetween, formatMAD, formatPercent, todayIso } from './helpers.ts';

Deno.test('daysBetween: inclusive of both ends', () => {
  assertEquals(daysBetween('2026-05-01', '2026-05-10'), 10);
  assertEquals(daysBetween('2026-05-01', '2026-05-01'), 1);
});

Deno.test('daysBetween: negative inclusive when end < start', () => {
  // Inclusive semantics in reverse direction: May 10 → May 1 covers 10 days, signed.
  assertEquals(daysBetween('2026-05-10', '2026-05-01'), -10);
});

Deno.test('formatMAD: integer MAD with thousands sep', () => {
  assertEquals(formatMAD(12345), '12 345 MAD');
  assertEquals(formatMAD(0), '0 MAD');
  assertEquals(formatMAD(1000000), '1 000 000 MAD');
});

Deno.test('formatPercent: integer percent', () => {
  assertEquals(formatPercent(0.928), '93 %');
  assertEquals(formatPercent(1.123), '112 %');
  assertEquals(formatPercent(0), '0 %');
});

Deno.test('todayIso: yyyy-mm-dd in UTC', () => {
  const t = todayIso();
  assertEquals(/^\d{4}-\d{2}-\d{2}$/.test(t), true);
});
