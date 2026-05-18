import { assertEquals } from 'std/assert/mod.ts';
import { computeSupplierAging } from './supplier_purchase_aging.ts';

Deno.test('supplier_aging: fires at 30-60 days as warning', () => {
  const result = computeSupplierAging({
    today: '2026-05-18',
    purchases: [{
      id: 'p1', supplier_id: 's1', supplier_name: 'Ciments Maroc',
      invoice_ref: 'CDM-001', purchased_at: '2026-04-10',
      payment_status: 'pending', total: 12_000,
    }],
  });
  assertEquals(result.length, 1);
  assertEquals(result[0].severity, 'warning');
  assertEquals((result[0].payload as { days_aging: number }).days_aging, 38);
});

Deno.test('supplier_aging: critical past 60 days', () => {
  const result = computeSupplierAging({
    today: '2026-05-18',
    purchases: [{
      id: 'p1', supplier_id: 's1', supplier_name: 'Ciments Maroc',
      invoice_ref: 'CDM-001', purchased_at: '2026-03-01',
      payment_status: 'pending', total: 12_000,
    }],
  });
  assertEquals(result[0].severity, 'critical');
});

Deno.test('supplier_aging: skips paid purchases', () => {
  const result = computeSupplierAging({
    today: '2026-05-18',
    purchases: [{
      id: 'p1', supplier_id: 's1', supplier_name: 'Ciments Maroc',
      invoice_ref: null, purchased_at: '2026-03-01',
      payment_status: 'paid', total: 12_000,
    }],
  });
  assertEquals(result.length, 0);
});

Deno.test('supplier_aging: skips purchases <30 days old', () => {
  const result = computeSupplierAging({
    today: '2026-05-18',
    purchases: [{
      id: 'p1', supplier_id: 's1', supplier_name: 'Ciments Maroc',
      invoice_ref: null, purchased_at: '2026-05-01',
      payment_status: 'pending', total: 12_000,
    }],
  });
  assertEquals(result.length, 0);
});
