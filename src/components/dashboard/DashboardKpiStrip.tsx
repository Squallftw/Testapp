import { formatMAD } from '@/lib/format';
import type { KpiKey } from './KpiDetailPanels';

interface DashboardKpiStripProps {
  activeChantiersCount: number;
  presentToday: number;
  alertsCount: number;
  cashPosition: number;
  isLoading?: boolean;
  expandedKey: KpiKey | null;
  onToggle: (key: KpiKey) => void;
}

export function DashboardKpiStrip({
  activeChantiersCount,
  presentToday,
  alertsCount,
  cashPosition,
  isLoading = false,
  expandedKey,
  onToggle,
}: DashboardKpiStripProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Kpi
        kpiKey="active"
        label="Chantiers actifs"
        value={activeChantiersCount}
        accent="teal"
        isLoading={isLoading}
        active={expandedKey === 'active'}
        onClick={() => onToggle('active')}
      />
      <Kpi
        kpiKey="present"
        label="Présents aujourd'hui"
        value={presentToday}
        accent="success"
        isLoading={isLoading}
        active={expandedKey === 'present'}
        onClick={() => onToggle('present')}
      />
      <Kpi
        kpiKey="alerts"
        label="Alertes ouvertes"
        value={alertsCount}
        accent={alertsCount > 0 ? 'terra' : 'muted'}
        isLoading={isLoading}
        active={expandedKey === 'alerts'}
        onClick={() => onToggle('alerts')}
      />
      <Kpi
        kpiKey="cash"
        label="Trésorerie nette"
        value={
          <span
            className={
              cashPosition >= 0 ? 'text-bati-success' : 'text-bati-terra'
            }
          >
            {cashPosition >= 0 ? '+' : '−'} {formatMAD(Math.abs(cashPosition))}
          </span>
        }
        accent={cashPosition >= 0 ? 'success' : 'terra'}
        isLoading={isLoading}
        active={expandedKey === 'cash'}
        onClick={() => onToggle('cash')}
      />
    </div>
  );
}

const ACCENT_TEXT: Record<string, string> = {
  teal: 'text-bati-teal',
  success: 'text-bati-success',
  ochre: 'text-bati-ochre',
  terra: 'text-bati-terra',
  muted: 'text-bati-text',
};

function Kpi({
  kpiKey,
  label,
  value,
  accent,
  isLoading,
  active,
  onClick,
}: {
  kpiKey: KpiKey;
  label: string;
  value: React.ReactNode;
  accent: 'teal' | 'success' | 'ochre' | 'terra' | 'muted';
  isLoading?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-controls={`kpi-panel-${kpiKey}`}
      className={`bati-card rounded-lg p-4 text-left transition-all hover:bg-bati-border-soft/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-bati-teal ${
        active ? 'ring-2 ring-bati-teal shadow-sm' : ''
      }`}
    >
      <div className="flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-wide text-bati-muted">
          {label}
        </div>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-bati-muted transition-transform ${active ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      <div
        className={`text-2xl font-bold mt-1.5 tabular-nums ${ACCENT_TEXT[accent]}`}
      >
        {isLoading ? <span className="text-bati-muted">…</span> : value}
      </div>
    </button>
  );
}
