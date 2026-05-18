// supabase/functions/recompute-alerts/engine.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlertCandidate, EngineSummary, Rule } from './types.ts';

const COOLDOWN_DAYS = 7;

export async function runEngine(
  sb: SupabaseClient,
  rules: Rule[]
): Promise<EngineSummary> {
  const summary: EngineSummary = {
    orgs: 0, inserted: 0, refreshed: 0, resolved: 0, skipped_cooldown: 0, errors: 0,
  };

  const orgsRes = await sb.from('organizations').select('id');
  const orgs = (orgsRes.data ?? []) as Array<{ id: string }>;
  summary.orgs = orgs.length;

  for (const org of orgs) {
    for (const rule of rules) {
      try {
        const candidates = await rule.recompute(sb, org.id);
        await reconcileRule(sb, org.id, rule, candidates, summary);
      } catch (err) {
        summary.errors += 1;
        console.error(`[engine] rule ${rule.kind} failed for org ${org.id}:`, err);
      }
    }
  }

  return summary;
}

async function reconcileRule(
  sb: SupabaseClient,
  orgId: string,
  rule: Rule,
  candidates: AlertCandidate[],
  summary: EngineSummary
): Promise<void> {
  // 1. Upsert each candidate. Honor 7-day cooldown after dismissal.
  for (const c of candidates) {
    const dismissed = await sb
      .from('alerts')
      .select('id, dismissed_at')
      .eq('org_id', orgId)
      .eq('fingerprint', c.fingerprint)
      .is('resolved_at', null)
      .order('dismissed_at', { ascending: false })
      .limit(1);
    const recent = (dismissed.data as Array<{ dismissed_at: string | null }> | null)?.[0];
    if (recent?.dismissed_at) {
      const dismissedAt = new Date(recent.dismissed_at).getTime();
      const cutoff = Date.now() - COOLDOWN_DAYS * 86_400_000;
      if (dismissedAt > cutoff) {
        summary.skipped_cooldown += 1;
        continue;
      }
    }

    const row = {
      org_id: orgId,
      chantier_id: c.chantier_id,
      kind: c.kind,
      severity: c.severity,
      title: c.title,
      body: c.body,
      entity_id: c.entity_id,
      fingerprint: c.fingerprint,
      payload: c.payload,
      last_seen_at: new Date().toISOString(),
      resolved_at: null,
      dismissed_at: null,
    };
    const up = await sb
      .from('alerts')
      .upsert(row, { onConflict: 'org_id,fingerprint', ignoreDuplicates: false });
    if (up.error) {
      summary.errors += 1;
      console.error(`[engine] upsert failed for ${c.fingerprint}:`, up.error);
      continue;
    }
    summary.inserted += 1;
  }

  // 2. Auto-resolve stale active alerts with this kind whose fingerprint isn't in the candidate set.
  const activeFingerprints = candidates.map((c) => c.fingerprint);
  const inList = activeFingerprints.length > 0
    ? `(${activeFingerprints.map((f) => `"${f}"`).join(',')})`
    : `("")`;
  const upd = await sb
    .from('alerts')
    .update({ resolved_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('kind', rule.kind)
    .is('resolved_at', null)
    .is('dismissed_at', null)
    .not('fingerprint', 'in', inList);
  if (upd.error) {
    summary.errors += 1;
  } else {
    summary.resolved += 1;
  }
}
