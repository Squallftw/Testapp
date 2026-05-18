import { assertEquals } from 'std/assert/mod.ts';
import { computeStockLow } from './stock_low.ts';

Deno.test('stock_low: fires when on_hand < threshold', () => {
  const result = computeStockLow({
    items: [{ item_id: 'i1', name: 'Ciment', unit: 'sac', reorder_threshold: 50, on_hand: 12 }],
  });
  assertEquals(result.length, 1);
  assertEquals(result[0].severity, 'warning');
  assertEquals(result[0].chantier_id, null);
  assertEquals(result[0].fingerprint, 'stock_low:i1');
});

Deno.test('stock_low: critical when on_hand <= 0', () => {
  const result = computeStockLow({
    items: [{ item_id: 'i1', name: 'Ciment', unit: 'sac', reorder_threshold: 50, on_hand: -3 }],
  });
  assertEquals(result[0].severity, 'critical');
});

Deno.test('stock_low: skips when threshold is 0', () => {
  const result = computeStockLow({
    items: [{ item_id: 'i1', name: 'Ciment', unit: 'sac', reorder_threshold: 0, on_hand: 12 }],
  });
  assertEquals(result.length, 0);
});

Deno.test('stock_low: skips when on_hand >= threshold', () => {
  const result = computeStockLow({
    items: [{ item_id: 'i1', name: 'Ciment', unit: 'sac', reorder_threshold: 50, on_hand: 100 }],
  });
  assertEquals(result.length, 0);
});
