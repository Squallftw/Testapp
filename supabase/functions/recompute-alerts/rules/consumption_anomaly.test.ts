import { assertEquals } from 'std/assert/mod.ts';
import { computeConsumptionAnomaly } from './consumption_anomaly.ts';

Deno.test('consumption_anomaly: fires when today qty > 3× avg AND above floor', () => {
  const result = computeConsumptionAnomaly({
    today: '2026-05-18',
    consumptionToday: [{
      chantier_id: 'c1', chantier_name: 'Villa',
      item_id: 'i1', item_name: 'Ciment', unit: 'sac',
      today_qty: 100,
    }],
    avgByItem: { 'i1': 25 },  // avg 25/day, today 100 = 4× → fires
  });
  assertEquals(result.length, 1);
  assertEquals(result[0].severity, 'info');
  assertEquals((result[0].payload as { ratio: number }).ratio, 4);
});

Deno.test('consumption_anomaly: skips when ratio <= 3', () => {
  const result = computeConsumptionAnomaly({
    today: '2026-05-18',
    consumptionToday: [{
      chantier_id: 'c1', chantier_name: 'Villa',
      item_id: 'i1', item_name: 'Ciment', unit: 'sac',
      today_qty: 60,
    }],
    avgByItem: { 'i1': 25 },  // 60/25 = 2.4× → skip
  });
  assertEquals(result.length, 0);
});

Deno.test('consumption_anomaly: skips when below floor', () => {
  // Floor for "sac" is 5.
  const result = computeConsumptionAnomaly({
    today: '2026-05-18',
    consumptionToday: [{
      chantier_id: 'c1', chantier_name: 'Villa',
      item_id: 'i1', item_name: 'Ciment', unit: 'sac',
      today_qty: 4,
    }],
    avgByItem: { 'i1': 0.5 },  // 4/0.5 = 8× but below floor 5
  });
  assertEquals(result.length, 0);
});

Deno.test('consumption_anomaly: uses DEFAULT_FLOOR for unknown unit', () => {
  // Unknown unit → default floor = 5.
  const result = computeConsumptionAnomaly({
    today: '2026-05-18',
    consumptionToday: [{
      chantier_id: 'c1', chantier_name: 'Villa',
      item_id: 'i1', item_name: 'X', unit: 'farfelu',
      today_qty: 6,
    }],
    avgByItem: { 'i1': 1 },  // 6× above avg, above default floor of 5
  });
  assertEquals(result.length, 1);
});

Deno.test('consumption_anomaly: fingerprint includes date', () => {
  const result = computeConsumptionAnomaly({
    today: '2026-05-18',
    consumptionToday: [{
      chantier_id: 'c1', chantier_name: 'V', item_id: 'i1', item_name: 'X', unit: 'sac', today_qty: 100,
    }],
    avgByItem: { 'i1': 10 },
  });
  assertEquals(result[0].fingerprint, 'consumption_anomaly:c1:i1:2026-05-18');
});
