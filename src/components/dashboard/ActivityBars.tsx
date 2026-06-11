export interface ActivityBarsProps {
  title: string;
  /** X-axis labels (e.g. weekday abbreviations). */
  labels: string[];
  /** Primary series (e.g. this week), one value per label. */
  current: number[];
  /** Optional comparison series (e.g. last week). */
  previous?: number[];
  currentLabel?: string;
  previousLabel?: string;
}

const W = 520;
const H = 168;

/**
 * Reference-style activity chart: rounded-top gradient bars over faint
 * gridlines, optionally pairing a primary (blue) series against a teal
 * comparison series. Pure SVG, scales to the card width.
 */
export function ActivityBars({
  title,
  labels,
  current,
  previous,
  currentLabel = 'Cette semaine',
  previousLabel = 'Précédente',
}: ActivityBarsProps) {
  const n = Math.max(1, labels.length);
  const max = Math.max(1, ...current, ...(previous ?? []));
  const slot = W / n;
  const barW = Math.min(26, slot * 0.32);
  const scale = (v: number) => (Math.max(0, v) / max) * (H - 18);

  return (
    <div className="bati-card bati-elev-1 p-5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-bati-text">{title}</div>
        <div className="flex gap-4 text-[11px] text-bati-muted">
          <span className="flex items-center gap-1.5">
            <i className="w-2 h-2 rounded-[2px]" style={{ background: 'var(--bati-primary)' }} />
            {currentLabel}
          </span>
          {previous && (
            <span className="flex items-center gap-1.5">
              <i className="w-2 h-2 rounded-[2px]" style={{ background: 'var(--bati-accent)' }} />
              {previousLabel}
            </span>
          )}
        </div>
      </div>

      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="mt-3"
        aria-hidden
      >
        <defs>
          <linearGradient id="ab-cur" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--bati-primary)" />
            <stop offset="1" stopColor="var(--bati-primary)" stopOpacity="0.25" />
          </linearGradient>
          <linearGradient id="ab-prev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--bati-accent)" stopOpacity="0.5" />
            <stop offset="1" stopColor="var(--bati-accent)" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 0.97].map((g) => (
          <line key={g} x1="0" y1={H * g} x2={W} y2={H * g} stroke="var(--bati-border-soft)" />
        ))}
        {labels.map((label, i) => {
          const cx = i * slot + slot / 2;
          const curH = scale(current[i] ?? 0);
          const prevH = previous ? scale(previous[i] ?? 0) : 0;
          return (
            <g key={label + i}>
              {previous && (
                <rect
                  x={cx - barW - 2}
                  y={H - prevH}
                  width={barW}
                  height={prevH}
                  rx="7"
                  fill="url(#ab-prev)"
                />
              )}
              <rect
                x={previous ? cx + 2 : cx - barW / 2}
                y={H - curH}
                width={barW}
                height={curH}
                rx="7"
                fill="url(#ab-cur)"
              />
            </g>
          );
        })}
      </svg>

      <div className="flex justify-between text-[11px] text-bati-muted mt-1.5">
        {labels.map((l, i) => (
          <span key={l + i}>{l}</span>
        ))}
      </div>
    </div>
  );
}
