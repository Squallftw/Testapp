import type { ReactNode } from 'react';

type Tone = 'neutral' | 'success' | 'warning' | 'danger';

const VALUE_TONE: Record<Tone, string> = {
  neutral: 'text-bati-text',
  success: 'text-bati-success',
  warning: 'text-bati-ochre',
  danger: 'text-bati-terra',
};

const DELTA_TONE: Record<Tone, string> = {
  neutral: 'text-bati-muted',
  success: 'text-bati-success',
  warning: 'text-bati-ochre',
  danger: 'text-bati-terra',
};

interface ProjectionCardProps {
  label: string;
  /** Headline value, e.g. "120 000 MAD" or "10 avril 2026". */
  value: ReactNode;
  /** Secondary line, e.g. "vs budget 100 000 MAD" or "prévue 10 avril 2026". */
  sublabel?: ReactNode;
  /** Bottom-right delta, e.g. "+20%" or "+15 jours". */
  delta?: ReactNode;
  /** Tone applied to value + delta colors. */
  tone?: Tone;
  /** Rendered when the underlying projection couldn't be computed. */
  insufficientReason?: string;
}

export function ProjectionCard({
  label,
  value,
  sublabel,
  delta,
  tone = 'neutral',
  insufficientReason,
}: ProjectionCardProps) {
  return (
    <div className="bati-card rounded-xl p-4 flex flex-col gap-1.5 min-w-0">
      <div className="text-xs uppercase tracking-wide text-bati-muted">
        {label}
      </div>
      {insufficientReason ? (
        <>
          <div className="text-lg font-semibold text-bati-muted">—</div>
          <div className="text-xs text-bati-muted">{insufficientReason}</div>
        </>
      ) : (
        <>
          <div
            className={`text-2xl font-bold tabular-nums truncate ${VALUE_TONE[tone]}`}
          >
            {value}
          </div>
          <div className="flex items-baseline justify-between gap-2">
            {sublabel ? (
              <div className="text-xs text-bati-muted truncate">{sublabel}</div>
            ) : (
              <div />
            )}
            {delta ? (
              <div
                className={`text-xs font-semibold tabular-nums shrink-0 ${DELTA_TONE[tone]}`}
              >
                {delta}
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
