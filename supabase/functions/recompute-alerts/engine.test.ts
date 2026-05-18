// supabase/functions/recompute-alerts/engine.test.ts
import { assertEquals } from 'std/assert/mod.ts';
import { runEngine } from './engine.ts';
import type { Rule, AlertCandidate } from './types.ts';

// Minimal stub of the Supabase API surface our engine uses.
function makeStub() {
  const calls: Array<{ op: string; table: string; args: unknown }> = [];
  const orgs = [{ id: 'org-1' }, { id: 'org-2' }];
  const existing: any[] = [];
  const upserts: any[] = [];
  const updates: any[] = [];

  const stub = {
    calls, upserts, updates,
    from(table: string) {
      return {
        select(_: string) {
          calls.push({ op: 'select', table, args: null });
          if (table === 'organizations') {
            return Promise.resolve({ data: orgs, error: null });
          }
          if (table === 'alerts') {
            // Chained query used to look up most-recent dismissal for cooldown
            return {
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    order: () => ({
                      limit: () => Promise.resolve({ data: existing, error: null }),
                    }),
                  }),
                }),
              }),
            };
          }
          return Promise.resolve({ data: [], error: null });
        },
        upsert(rows: any, _opts: any) {
          calls.push({ op: 'upsert', table, args: rows });
          upserts.push(...(Array.isArray(rows) ? rows : [rows]));
          return Promise.resolve({ data: null, error: null });
        },
        update(patch: any) {
          calls.push({ op: 'update', table, args: patch });
          updates.push(patch);
          return {
            eq: () => ({
              eq: () => ({
                is: () => ({
                  is: () => ({
                    not: () => Promise.resolve({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          };
        },
      };
    },
  };
  return stub;
}

Deno.test('runEngine: rule with one candidate inserts one alert per org', async () => {
  const sb = makeStub();
  const rule: Rule = {
    kind: 'chantier_overdue',
    recompute: async (_sb, orgId) => [{
      kind: 'chantier_overdue',
      severity: 'warning',
      title: 'test',
      body: 'body',
      chantier_id: `${orgId}-chantier`,
      entity_id: null,
      fingerprint: `chantier_overdue:${orgId}-chantier`,
      payload: {},
    } as AlertCandidate],
  };
  const summary = await runEngine(sb as any, [rule]);
  assertEquals(summary.orgs, 2);
  assertEquals(sb.upserts.length, 2);
  assertEquals(sb.upserts[0].fingerprint, 'chantier_overdue:org-1-chantier');
  assertEquals(sb.upserts[1].fingerprint, 'chantier_overdue:org-2-chantier');
});

Deno.test('runEngine: rule with zero candidates triggers auto-resolve update', async () => {
  const sb = makeStub();
  const rule: Rule = {
    kind: 'chantier_overdue',
    recompute: async () => [],
  };
  await runEngine(sb as any, [rule]);
  assertEquals(sb.updates.length >= 2, true);
  assertEquals(sb.updates[0].resolved_at !== undefined, true);
});

Deno.test('runEngine: rule errors do not crash the engine', async () => {
  const sb = makeStub();
  const ruleOk: Rule = {
    kind: 'chantier_overdue',
    recompute: async () => [],
  };
  const ruleBad: Rule = {
    kind: 'stock_low',
    recompute: async () => { throw new Error('boom'); },
  };
  const summary = await runEngine(sb as any, [ruleBad, ruleOk]);
  assertEquals(summary.errors >= 1, true);
  assertEquals(summary.orgs, 2);
});
