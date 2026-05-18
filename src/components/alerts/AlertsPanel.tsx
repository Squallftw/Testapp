// src/components/alerts/AlertsPanel.tsx
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useOrg } from '@/contexts/OrgContext';
import { dismissAlert, listAlertsForChantier, undismissAlert } from '@/data/alerts';
import { toast } from '@/components/ui/Toast';
import { AlertCard } from './AlertCard';

interface AlertsPanelProps {
  chantierId: string;
}

export function AlertsPanel({ chantierId }: AlertsPanelProps) {
  const { activeOrg } = useOrg();
  const queryClient = useQueryClient();

  const alerts = useQuery({
    queryKey: ['alerts', 'chantier', activeOrg?.id, chantierId],
    queryFn: () => listAlertsForChantier(chantierId),
    enabled: !!activeOrg,
    refetchInterval: 60_000,
  });

  const dismiss = useMutation({
    mutationFn: dismissAlert,
    onSuccess: async (_data, id) => {
      await queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast.success('Alerte ignorée', {
        action: {
          label: 'Annuler',
          onClick: async () => {
            try {
              await undismissAlert(id);
              await queryClient.invalidateQueries({ queryKey: ['alerts'] });
            } catch (err) {
              toast.fromError(err, 'Annulation impossible');
            }
          },
        },
      });
    },
    onError: (err) => toast.fromError(err, 'Impossible d\'ignorer l\'alerte'),
  });

  if (alerts.isLoading || (alerts.data?.length ?? 0) === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-bati-muted">
        Alertes actives ({alerts.data?.length})
      </h3>
      <div className="space-y-2">
        {(alerts.data ?? []).map((a) => (
          <AlertCard key={a.id} alert={a} onDismiss={(id) => dismiss.mutate(id)} />
        ))}
      </div>
    </div>
  );
}
