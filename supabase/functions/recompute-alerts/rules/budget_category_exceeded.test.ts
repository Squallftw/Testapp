// supabase/functions/recompute-alerts/rules/budget_category_exceeded.test.ts
import { assertEquals } from 'std/assert/mod.ts';
import { computeCategoryExceeded } from './budget_category_exceeded.ts';

Deno.test('category_exceeded: fires only for categories where spent > budget', () => {
  // labor: 52/50 = 104% → warning; materials: 20/25 = 80% → skip; equipment: 0 budget → skip.
  const result = computeCategoryExceeded({
    chantiers: [{
      id: 'c1', name: 'Villa', status: 'active',
      budget_labor: 50_000, labor_spent: 52_000,
      budget_materials: 25_000, materials_spent: 20_000,
      budget_equipment: 0, equipment_spent: 0,
    }],
  });
  assertEquals(result.length, 1);
  const labor = result.find((r) => r.fingerprint === 'budget_category_exceeded:c1:labor')!;
  assertEquals(labor.severity, 'warning');
});

Deno.test('category_exceeded: critical when > 110%', () => {
  const result = computeCategoryExceeded({
    chantiers: [{
      id: 'c1', name: 'Villa', status: 'active',
      budget_labor: 50_000, labor_spent: 60_000,
      budget_materials: 25_000, materials_spent: 20_000,
      budget_equipment: 0, equipment_spent: 0,
    }],
  });
  const labor = result.find((r) => r.fingerprint === 'budget_category_exceeded:c1:labor')!;
  assertEquals(labor.severity, 'critical');
});

Deno.test('category_exceeded: warning when 100% < pct <= 110%', () => {
  const result = computeCategoryExceeded({
    chantiers: [{
      id: 'c1', name: 'Villa', status: 'active',
      budget_labor: 50_000, labor_spent: 52_000,  // 104%
      budget_materials: 0, materials_spent: 0,
      budget_equipment: 0, equipment_spent: 0,
    }],
  });
  assertEquals(result[0].severity, 'warning');
});

Deno.test('category_exceeded: skips when budget = 0', () => {
  const result = computeCategoryExceeded({
    chantiers: [{
      id: 'c1', name: 'Villa', status: 'active',
      budget_labor: 0, labor_spent: 5000,
      budget_materials: 0, materials_spent: 0,
      budget_equipment: 0, equipment_spent: 0,
    }],
  });
  assertEquals(result.length, 0);
});

Deno.test('category_exceeded: skips inactive chantier', () => {
  const result = computeCategoryExceeded({
    chantiers: [{
      id: 'c1', name: 'Atelier', status: 'completed',
      budget_labor: 50_000, labor_spent: 60_000,
      budget_materials: 0, materials_spent: 0,
      budget_equipment: 0, equipment_spent: 0,
    }],
  });
  assertEquals(result.length, 0);
});
