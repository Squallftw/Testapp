// src/components/alerts/AlertesSection.tsx
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useOrg } from '@/contexts/OrgContext';
import { listActiveAlerts } from '@/data/alerts';
import { AlertCard } from './AlertCard';

export function AlertesSection() {
  const { activeOrg } = useOrg();
  const alerts = useQuery({
    queryKey: ['alerts', 'active', activeOrg?.id],
    queryFn: listActiveAlerts,
    enabled: !!activeOrg,
    refetchInterval: 60_000,
  });

  const significant = (alerts.data ?? []).filter(
    (a) => a.severity === 'critical' || a.severity === 'warning'
  );
  const top5 = significant.slice(0, 5);
  const total = significant.length;

  if (top5.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-bati-text">
          Alertes
        </h2>
        <Link to="/alertes" className="text-xs text-bati-teal hover:underline">
          Voir toutes les alertes ({total}) →
        </Link>
      </div>
      <div className="space-y-2">
        {top5.map((a) => (
          <AlertCard key={a.id} alert={a} />
        ))}
      </div>
    </section>
  );
}
