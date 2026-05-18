// src/pages/alertes/AlertsPage.tsx
import { useState, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useOrg } from '@/contexts/OrgContext';
import {
  dismissAlert,
  listActiveAlerts,
  listAlertHistory,
  undismissAlert,
  type AlertSeverity,
} from '@/data/alerts';
import { toast } from '@/components/ui/Toast';
import { AlertCard } from '@/components/alerts/AlertCard';
import { SetupBanner } from '@/components/alerts/SetupBanner';

const SEVERITY_FILTERS: Array<{ value: AlertSeverity | 'all'; label: string }> = [
  { value: 'all',      label: 'Toutes' },
  { value: 'critical', label: 'Critiques' },
  { value: 'warning',  label: 'Avertissements' },
  { value: 'info',     label: 'Info' },
];

export default function AlertsPage() {
  const { activeOrg } = useOrg();
  const queryClient = useQueryClient();
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'all'>('all');
  const [showHistory, setShowHistory] = useState(false);

  const active = useQuery({
    queryKey: ['alerts', 'active', activeOrg?.id],
    queryFn: listActiveAlerts,
    enabled: !!activeOrg,
    refetchInterval: 60_000,
  });

  const history = useQuery({
    queryKey: ['alerts', 'history', activeOrg?.id],
    queryFn: listAlertHistory,
    enabled: !!activeOrg && showHistory,
  });

  const dismiss = useMutation({
    mutationFn: dismissAlert,
    onSuccess: async (_d, id) => {
      await queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast.success('Alerte ignorée', {
        action: {
          label: 'Annuler',
          onClick: async () => {
            await undismissAlert(id);
            await queryClient.invalidateQueries({ queryKey: ['alerts'] });
          },
        },
      });
    },
    onError: (err) => toast.fromError(err, 'Impossible d\'ignorer l\'alerte'),
  });

  const filtered = useMemo(() => {
    const all = active.data ?? [];
    if (severityFilter === 'all') return all;
    return all.filter((a) => a.severity === severityFilter);
  }, [active.data, severityFilter]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-bati-text">Alertes</h1>
        <p className="text-sm text-bati-muted mt-0.5">
          Détections automatiques sur vos chantiers, recalculées toutes les 15 minutes.
        </p>
      </div>

      <SetupBanner />

      <div className="flex flex-wrap gap-2 items-center">
        {SEVERITY_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setSeverityFilter(f.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              severityFilter === f.value
                ? 'bg-bati-teal text-white'
                : 'bg-bati-card border border-bati-border text-bati-muted hover:bg-bati-border-soft'
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="flex-1" />
        <label className="text-xs text-bati-muted inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={showHistory}
            onChange={(e) => setShowHistory(e.target.checked)}
          />
          Voir l&apos;historique
        </label>
      </div>

      {active.isLoading && <div className="text-sm text-bati-muted">Chargement…</div>}

      {!active.isLoading && active.error && (
        <div className="bati-card rounded-lg p-6 text-sm text-bati-muted text-center">
          Impossible de charger les alertes. Voir le bandeau ci-dessus pour le diagnostic.
        </div>
      )}

      {!active.isLoading && !active.error && filtered.length === 0 && (active.data?.length ?? 0) > 0 && (
        <div className="bati-card rounded-lg p-6 text-sm text-bati-muted text-center">
          Aucune alerte pour ce filtre.
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((a) => (
          <AlertCard key={a.id} alert={a} onDismiss={(id) => dismiss.mutate(id)} />
        ))}
      </div>

      {showHistory && (history.data?.length ?? 0) > 0 && (
        <section className="pt-4 border-t border-bati-border-soft">
          <h2 className="text-xs uppercase tracking-wide text-bati-muted mb-2">Historique</h2>
          <div className="space-y-2 opacity-70">
            {(history.data ?? []).map((a) => (
              <AlertCard key={a.id} alert={a} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
