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

// CORS headers — required when the function is invoked from a browser
// (the SetupBanner's « Recalculer maintenant » button). pg_cron invocations
// are server-to-server and ignore these.
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Missing env vars' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
    });
  }

  try {
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const summary = await runEngine(sb, RULES);
    console.log('[recompute-alerts]', summary);
    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[recompute-alerts] fatal:', err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
    });
  }
});
