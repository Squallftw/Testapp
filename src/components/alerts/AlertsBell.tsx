// src/components/alerts/AlertsBell.tsx
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as Popover from '@radix-ui/react-popover';
import { useOrg } from '@/contexts/OrgContext';
import { listActiveAlerts } from '@/data/alerts';
import { AlertCard } from './AlertCard';

export function AlertsBell() {
  const { activeOrg, myRole } = useOrg();
  const canSee = myRole === 'owner' || myRole === 'admin' || myRole === 'site_manager';

  const alerts = useQuery({
    queryKey: ['alerts', 'active', activeOrg?.id],
    queryFn: listActiveAlerts,
    enabled: !!activeOrg && canSee,
    refetchInterval: 60_000,
  });

  if (!canSee) return null;

  const count = alerts.data?.length ?? 0;
  const top5 = (alerts.data ?? []).slice(0, 5);

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={count > 0 ? `${count} alerte(s) active(s)` : 'Aucune alerte'}
          className="relative p-2 rounded-md hover:bg-bati-border-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-bati-teal"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {count > 0 && (
            <span
              className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-bati-terra text-white text-[10px] font-bold leading-4 text-center"
              aria-hidden
            >
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="w-80 bg-bati-card border border-bati-border rounded-lg shadow-lg p-2 z-50"
        >
          <div className="flex items-baseline justify-between px-2 py-1">
            <h3 className="text-xs font-semibold text-bati-text uppercase tracking-wide">Alertes</h3>
            <span className="text-[10px] text-bati-muted">{count} active{count > 1 ? 's' : ''}</span>
          </div>
          {alerts.isLoading && <div className="px-2 py-3 text-xs text-bati-muted">Chargement…</div>}
          {!alerts.isLoading && top5.length === 0 && (
            <div className="px-2 py-3 text-xs text-bati-muted">Aucune alerte — tout va bien.</div>
          )}
          <div className="space-y-1">
            {top5.map((a) => (
              <AlertCard key={a.id} alert={a} size="compact" />
            ))}
          </div>
          {count > 0 && (
            <div className="border-t border-bati-border-soft mt-2 pt-2 px-2">
              <Link
                to="/alertes"
                className="text-xs text-bati-teal hover:underline"
              >
                Voir toutes les alertes →
              </Link>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
