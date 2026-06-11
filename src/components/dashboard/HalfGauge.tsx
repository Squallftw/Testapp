export interface HalfGaugeLegendItem {
  label: string;
  value: string;
  /** Swatch colour (CSS value). Defaults to primary. */
  color?: string;
}

export interface HalfGaugeProps {
  title: string;
  /** Filled proportion, 0–100. */
  pct: number;
  caption?: string;
  legend?: HalfGaugeLegendItem[];
}

// Semicircle arc from (14,96) to (170,96), radius 78 → length = π·78 ≈ 245.
const ARC_LEN = Math.PI * 78;

/**
 * Minimal half-gauge card: a semicircle track with a primary fill, the big
 * percentage centred under the arc, an optional caption, and an optional
 * legend. Chosen over the donut for a lighter, lower-profile performance card.
 */
export function HalfGauge({ title, pct, caption, legend }: HalfGaugeProps) {
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = ARC_LEN * (1 - clamped / 100);

  return (
    <div className="bati-card bati-elev-1 p-5 flex flex-col">
      <div className="text-sm font-bold text-bati-text">{title}</div>

      <div className="relative mx-auto mt-3" style={{ width: 184, height: 104 }}>
        <svg width="184" height="104" viewBox="0 0 184 104" aria-hidden>
          <path
            d="M14 96 A78 78 0 0 1 170 96"
            fill="none"
            stroke="var(--bati-border-soft)"
            strokeWidth="16"
            strokeLinecap="round"
          />
          <path
            d="M14 96 A78 78 0 0 1 170 96"
            fill="none"
            stroke="var(--bati-primary)"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={ARC_LEN}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-0.5">
          <div className="text-3xl font-extrabold tabular-nums text-bati-text leading-none">
            {Math.round(clamped)}%
          </div>
          {caption && <div className="text-[11px] text-bati-muted mt-0.5">{caption}</div>}
        </div>
      </div>

      {legend && legend.length > 0 && (
        <div className="mt-4 space-y-2">
          {legend.map((l) => (
            <div key={l.label} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-bati-muted">
                <span
                  className="w-2.5 h-2.5 rounded-[3px]"
                  style={{ background: l.color ?? 'var(--bati-primary)' }}
                />
                {l.label}
              </span>
              <span className="font-bold tabular-nums">{l.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
