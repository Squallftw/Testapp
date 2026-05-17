import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Chantier } from '@/data/chantiers';
import type { BudgetSummary } from '@/data/budget-engine';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatMAD } from '@/lib/format';

interface PausedChantiersStripProps {
  chantiers: Chantier[];
  summariesById: Map<string, BudgetSummary>;
}

const COLLAPSED_LIMIT = 6;

/**
 * Bottom-of-dashboard strip for inactive chantiers (paused, completed,
 * cancelled). Renders nothing if `chantiers` is empty. Collapsed by default
 * past COLLAPSED_LIMIT items with a toggle to expand.
 */
export function PausedChantiersStrip({
  chantiers,
  summariesById,
}: PausedChantiersStripProps) {
  const [expanded, setExpanded] = useState(false);

  if (chantiers.length === 0) return null;

  const visible =
    expanded || chantiers.length <= COLLAPSED_LIMIT
      ? chantiers
      : chantiers.slice(0, COLLAPSED_LIMIT);
  const hiddenCount = chantiers.length - visible.length;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs uppercase tracking-wide text-bati-muted">
          Archivés / en pause
        </h3>
        {chantiers.length > COLLAPSED_LIMIT && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-bati-teal hover:underline"
          >
            {expanded ? 'Réduire' : `Voir ${hiddenCount} de plus`}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {visible.map((c) => {
          const summary = summariesById.get(c.id);
          const spent = summary?.total_spent ?? 0;
          return (
            <Link
              key={c.id}
              to={`/chantiers/${c.id}`}
              className="inline-flex items-center gap-2 bati-card rounded-full pl-2 pr-3 py-1 text-xs hover:bg-bati-border-soft transition-colors"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: c.color ?? 'var(--bati-border)' }}
                aria-hidden
              />
              <span className="font-medium text-bati-text truncate max-w-[12rem]">
                {c.name}
              </span>
              <StatusBadge status={c.status} />
              <span className="tabular-nums text-bati-muted">
                {formatMAD(spent)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
