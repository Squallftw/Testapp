import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useOrg } from '@/contexts/OrgContext';
import { getAlertsHealth, recomputeAlertsNow } from '@/data/alerts';

const RUNBOOK_PATH = 'docs/runbooks/recompute-alerts.md';
const DEPLOY_CMD = 'npx supabase functions deploy recompute-alerts --no-verify-jwt';

interface BannerShellProps {
  tone: 'terra' | 'ochre' | 'success' | 'muted';
  title: string;
  detail?: React.ReactNode;
  action?: React.ReactNode;
}

function BannerShell({ tone, title, detail, action }: BannerShellProps) {
  const TONE: Record<BannerShellProps['tone'], string> = {
    terra: 'border-bati-terra/40 bg-bati-terra/5',
    ochre: 'border-bati-ochre/40 bg-bati-ochre/5',
    success: 'border-bati-success/40 bg-bati-success/5',
    muted: 'border-bati-border bg-bati-card',
  };
  const TITLE_TONE: Record<BannerShellProps['tone'], string> = {
    terra: 'text-bati-terra',
    ochre: 'text-bati-ochre',
    success: 'text-bati-success',
    muted: 'text-bati-muted',
  };
  return (
    <div className={`border rounded-lg p-3 flex gap-3 items-start ${TONE[tone]}`}>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${TITLE_TONE[tone]}`}>{title}</p>
        {detail && <div className="text-xs text-bati-text mt-1 space-y-1">{detail}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function SetupBanner() {
  const { activeOrg } = useOrg();
  const queryClient = useQueryClient();
  const [lastRun, setLastRun] = useState<string | null>(null);
  const isDev = import.meta.env.DEV;

  const health = useQuery({
    queryKey: ['alerts', 'health', activeOrg?.id],
    queryFn: getAlertsHealth,
    enabled: !!activeOrg,
    refetchInterval: 60_000,
    retry: false,
  });

  const recompute = useMutation({
    mutationFn: recomputeAlertsNow,
    onSuccess: async (summary) => {
      setLastRun(
        `Succès — ${summary.orgs} org · ${summary.inserted} alerte(s) enregistrée(s) · ${summary.resolved} résolue(s) · ${summary.errors} erreur(s).`
      );
      await queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      setLastRun(`Échec — ${message}`);
    },
  });

  const recomputeButton = (
    <button
      type="button"
      onClick={() => recompute.mutate()}
      disabled={recompute.isPending}
      className="text-xs font-medium px-3 py-1.5 rounded-md bg-bati-teal text-white hover:bg-bati-teal/90 disabled:opacity-50"
    >
      {recompute.isPending ? 'Calcul en cours…' : 'Recalculer maintenant'}
    </button>
  );

  if (!activeOrg) return null;
  if (health.isLoading) return null;

  // Health query failed for a reason other than "table missing"
  if (health.error) {
    const message = health.error instanceof Error ? health.error.message : String(health.error);
    return (
      <BannerShell
        tone="terra"
        title="Impossible de vérifier l'état du module Alertes"
        detail={<p className="font-mono text-[11px]">{message}</p>}
      />
    );
  }

  const state = health.data?.state;

  if (state === 'no_table') {
    return (
      <BannerShell
        tone="terra"
        title="Module Alertes non activé"
        detail={
          <>
            <p>
              La table <code className="font-mono">public.alerts</code> n&apos;existe pas dans votre projet
              Supabase. Appliquez la migration{' '}
              <code className="font-mono">supabase/migrations/0007_alerts.sql</code> dans le SQL
              Editor de Supabase.
            </p>
            <p className="text-bati-muted">
              Procédure complète : <code className="font-mono">{RUNBOOK_PATH}</code>.
            </p>
          </>
        }
      />
    );
  }

  if (state === 'empty') {
    return (
      <BannerShell
        tone="ochre"
        title="Aucune alerte calculée pour le moment"
        detail={
          <>
            <p>
              Le module est activé mais le moteur n&apos;a encore enregistré aucune alerte. Le calcul
              automatique a lieu toutes les 15 minutes via <code className="font-mono">pg_cron</code>.
            </p>
            {isDev && lastRun && (
              <p className={lastRun.startsWith('Succès') ? 'text-bati-success' : 'text-bati-terra'}>
                {lastRun}
              </p>
            )}
            {!isDev && (
              <p className="text-bati-muted">
                Si aucune alerte n&apos;apparaît après 15 min, vérifiez le job{' '}
                <code className="font-mono">recompute-alerts</code> dans{' '}
                <code className="font-mono">cron.job_run_details</code>.
              </p>
            )}
            {isDev && lastRun?.includes('404') && (
              <p className="text-bati-muted">
                La Edge Function n&apos;est pas déployée. Lancez :{' '}
                <code className="font-mono">{DEPLOY_CMD}</code>
              </p>
            )}
          </>
        }
        action={isDev ? recomputeButton : undefined}
      />
    );
  }

  if (state === 'ok' && health.data) {
    const lastSeen = formatDistanceToNow(parseISO(health.data.lastSeenAt), {
      addSuffix: true,
      locale: fr,
    });
    return (
      <BannerShell
        tone="success"
        title={`${health.data.activeCount} alerte${health.data.activeCount > 1 ? 's' : ''} active${health.data.activeCount > 1 ? 's' : ''} · dernier calcul ${lastSeen}`}
        action={isDev ? recomputeButton : undefined}
        detail={
          isDev && lastRun ? (
            <p className={lastRun.startsWith('Succès') ? 'text-bati-success' : 'text-bati-terra'}>
              {lastRun}
            </p>
          ) : undefined
        }
      />
    );
  }

  return null;
}
