import type { ReactNode } from 'react';

export type StatCardAccent = 'teal' | 'terra' | 'success' | 'muted' | 'ochre';

const ACCENT_CLASS: Record<StatCardAccent, string> = {
  teal: 'text-bati-teal',
  terra: 'text-bati-terra',
  success: 'text-bati-success',
  ochre: 'text-bati-ochre',
  muted: 'text-bati-text',
};

export interface StatCardProps {
  label: string;
  value: ReactNode;
  subtitle?: string;
  accent?: StatCardAccent;
  onClick?: () => void;
}

export function StatCard({
  label,
  value,
  subtitle,
  accent = 'muted',
  onClick,
}: StatCardProps) {
  const inner = (
    <>
      <div className="text-xs uppercase tracking-wide text-bati-muted">{label}</div>
      <div className={`text-xl font-bold mt-2 tabular-nums ${ACCENT_CLASS[accent]}`}>
        {value}
      </div>
      {subtitle && <div className="text-xs text-bati-muted mt-1">{subtitle}</div>}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="bati-card rounded-lg p-4 text-left w-full hover:bg-bati-border-soft transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bati-teal"
      >
        {inner}
      </button>
    );
  }
  return <div className="bati-card rounded-lg p-4">{inner}</div>;
}
