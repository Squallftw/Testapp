// supabase/functions/recompute-alerts/index.ts
import { createClient } from '@supabase/supabase-js';
import { runEngine } from './engine.ts';
import type { Rule } from './types.ts';

import { recompute as budgetBurnForecast } from './rules/budget_burn_forecast.ts';
import { recompute as budgetCategoryExceeded } from './rules/budget_category_exceeded.ts';
import { recompute as chantierOverdue } from './rules/chantier_overdue.ts';
import { recompute as taskOverdue } from './rules/task_overdue.ts';
import { recompute as stockLow } from './rules/stock_low.ts';
import { recompute as cashNegative } from './rules/cash_negative.ts';
import { recompute as supplierAging } from './rules/supplier_purchase_aging.ts';
import { recompute as consumptionAnomaly } from './rules/consumption_anomaly.ts';

const RULES: Rule[] = [
  { kind: 'budget_burn_forecast',     recompute: budgetBurnForecast },
  { kind: 'budget_category_exceeded', recompute: budgetCategoryExceeded },
  { kind: 'chantier_overdue',         recompute: chantierOverdue },
  { kind: 'task_overdue',             recompute: taskOverdue },
  { kind: 'stock_low',                recompute: stockLow },
  { kind: 'cash_negative',            recompute: cashNegative },
  { kind: 'supplier_purchase_aging',  recompute: supplierAging },
  { kind: 'consumption_anomaly',      recompute: consumptionAnomaly },
];

Deno.serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Missing env vars' }), { status: 500 });
  }
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const summary = await runEngine(sb, RULES);
  console.log('[recompute-alerts]', summary);
  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
