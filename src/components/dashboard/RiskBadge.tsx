import type { RiskLevel } from '@/lib/foresight';

const RISK_LABEL: Record<RiskLevel, string> = {
  green: 'Sain',
  yellow: 'Vigilance',
  red: 'Risque',
};

const RISK_CLASS: Record<RiskLevel, string> = {
  green: 'bg-bati-success-soft text-[#067647]',
  yellow: 'bg-bati-warning-soft text-[#B54708]',
  red: 'bg-bati-terra-soft text-[#9a2a17]',
};

const RISK_DOT: Record<RiskLevel, string> = {
  green: 'bg-bati-success',
  yellow: 'bg-bati-warning',
  red: 'bg-bati-terra',
};

interface RiskBadgeProps {
  level: RiskLevel;
  /** When true, renders just the dot — no label or background. */
  dotOnly?: boolean;
}

export function RiskBadge({ level, dotOnly = false }: RiskBadgeProps) {
  if (dotOnly) {
    return (
      <span
        className={`inline-block w-2.5 h-2.5 rounded-full ${RISK_DOT[level]}`}
        aria-label={RISK_LABEL[level]}
      />
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${RISK_CLASS[level]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${RISK_DOT[level]}`} aria-hidden />
      {RISK_LABEL[level]}
    </span>
  );
}
