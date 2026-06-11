import type { ReactNode } from 'react';
import { Sparkline } from './Sparkline';

export interface KpiDelta {
  /** Display text, e.g. "12%" or "3". */
  label: string;
  direction: 'up' | 'down';
}

export interface KpiTileProps {
  label: string;
  value: ReactNode;
  /** Optional delta badge (green up / terra down). Omit when no period
      comparison is available — never fabricate a trend. */
  delta?: KpiDelta;
  /** Optional sparkline series. Rendered only when 2+ points exist. */
  series?: number[];
  /** Sparkline accent: 'primary' (blue) or 'accent' (teal heritage). */
  accent?: 'primary' | 'accent';
}

const ACCENT_VAR: Record<'primary' | 'accent', string> = {
  primary: 'var(--bati-primary)',
  accent: 'var(--bati-accent)',
};

/**
 * Reference-style KPI tile: label + optional delta pill on top, big tabular
 * value with an optional area-sparkline on the baseline. Delta and sparkline
 * are both optional so tiles without trend data still read cleanly.
 */
export function KpiTile({ label, value, delta, series, accent = 'primary' }: KpiTileProps) {
  return (
    <div className="bati-card bati-elev-1 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-bati-muted">{label}</span>
        {delta && <DeltaPill {...delta} />}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="text-2xl font-bold tabular-nums text-bati-text leading-none">
          {value}
        </div>
        {series && series.length > 1 && (
          <Sparkline
            values={series}
            width={84}
            height={34}
            color={ACCENT_VAR[accent]}
            showArea
            strokeWidth={2}
          />
        )}
      </div>
    </div>
  );
}

function DeltaPill({ label, direction }: KpiDelta) {
  const up = direction === 'up';
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-bold ${
        up ? 'bg-bati-success-soft text-[#067647]' : 'bg-bati-terra-soft text-[#9a2a17]'
      }`}
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {up ? <path d="M7 17L17 7M9 7h8v8" /> : <path d="M17 7L7 17M15 17H7V9" />}
      </svg>
      {label}
    </span>
  );
}
