import { Link } from 'react-router-dom';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { Alert, AlertSeverity } from '@/data/alerts';

interface AlertCardProps {
  alert: Alert;
  size?: 'compact' | 'default';
  onDismiss?: (id: string) => void;
}

const SEVERITY_STRIPE: Record<AlertSeverity, string> = {
  critical: 'bg-bati-terra',
  warning: 'bg-bati-ochre',
  info: 'bg-bati-muted',
};

const SEVERITY_TEXT: Record<AlertSeverity, string> = {
  critical: 'text-bati-terra',
  warning: 'text-bati-ochre',
  info: 'text-bati-muted',
};

export function AlertCard({ alert, size = 'default', onDismiss }: AlertCardProps) {
  const compact = size === 'compact';
  const stripeWidth = compact ? 'w-1' : 'w-1.5';

  return (
    <div
      data-severity={alert.severity}
      className={`bati-card rounded-lg ${compact ? 'p-2' : 'p-3'} flex gap-3 items-start`}
    >
      <div
        className={`${stripeWidth} self-stretch min-h-[2rem] rounded-full shrink-0 ${SEVERITY_STRIPE[alert.severity]}`}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className={`font-semibold ${compact ? 'text-xs' : 'text-sm'} ${SEVERITY_TEXT[alert.severity]}`}>
            {alert.title}
          </h4>
          <span className="text-[10px] text-bati-muted shrink-0 tabular-nums">
            {formatDistanceToNow(parseISO(alert.last_seen_at), { addSuffix: true, locale: fr })}
          </span>
        </div>
        {alert.body && (
          <p className={`${compact ? 'text-[11px]' : 'text-xs'} text-bati-text mt-1`}>
            {alert.body}
          </p>
        )}
        {alert.chantier_id && !compact && (
          <Link
            to={`/chantiers/${alert.chantier_id}`}
            className="text-[11px] text-bati-teal hover:underline mt-1 inline-block"
          >
            Ouvrir le chantier →
          </Link>
        )}
      </div>
      {!compact && onDismiss && (
        <button
          type="button"
          onClick={() => onDismiss(alert.id)}
          className="text-xs text-bati-muted hover:text-bati-text px-2 py-1 rounded-md hover:bg-bati-border-soft shrink-0"
        >
          Ignorer
        </button>
      )}
    </div>
  );
}
