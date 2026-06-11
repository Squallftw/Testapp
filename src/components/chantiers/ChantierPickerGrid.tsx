import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  CHANTIER_STATUS_LABEL,
  type Chantier,
  type ChantierStatus,
} from '@/data/chantiers';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { RiskBadge } from '@/components/dashboard/RiskBadge';
import { getBudgetHealth, HEALTH_BAR_BG } from '@/components/dashboard/budget-health';
import { formatDate } from '@/lib/format';
import {
  useChantierPreviews,
  type ChantierPreview,
} from '@/lib/useChantierPreviews';

const STATUS_ORDER: Record<ChantierStatus, number> = {
  active: 0,
  paused: 1,
  completed: 2,
  cancelled: 3,
};

interface ChantierPickerGridProps {
  chantiers: Chantier[];
  /** Destination for a tile click, e.g. (id) => `/chantiers/${id}`. */
  getHref: (chantierId: string) => string;
}

/**
 * Searchable, filterable grid of project tiles with at-a-glance health:
 * présents aujourd'hui, risk, budget consumed, task progress, next deadline.
 * The single door to everything project-scoped (project-first IA).
 */
export function ChantierPickerGrid({ chantiers, getHref }: ChantierPickerGridProps) {
  const { byId, isLoading } = useChantierPreviews(chantiers);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ChantierStatus>('all');

  const counts = useMemo(() => {
    const m = new Map<'all' | ChantierStatus, number>([['all', chantiers.length]]);
    for (const c of chantiers) m.set(c.status, (m.get(c.status) ?? 0) + 1);
    return m;
  }, [chantiers]);

  const filters = useMemo(() => {
    const present: ('all' | ChantierStatus)[] = ['all'];
    for (const s of ['active', 'paused', 'completed', 'cancelled'] as ChantierStatus[]) {
      if ((counts.get(s) ?? 0) > 0) present.push(s);
    }
    return present;
  }, [counts]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return chantiers
      .filter((c) => statusFilter === 'all' || c.status === statusFilter)
      .filter((c) => {
        if (!q) return true;
        const hay = [c.name, c.client_name, c.manager_name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .sort(
        (a, b) =>
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
          a.name.localeCompare(b.name, 'fr')
      );
  }, [chantiers, search, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-bati-muted"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un chantier…"
            aria-label="Rechercher un chantier"
            className="bati-input pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => {
            const on = statusFilter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={`h-8 inline-flex items-center gap-1.5 px-3 rounded-full text-[12.5px] border transition-colors ${
                  on
                    ? 'bg-bati-primary-soft border-transparent text-bati-primary-deep font-semibold'
                    : 'bg-white border-bati-border text-bati-muted font-medium hover:border-[#cdd5e2]'
                }`}
              >
                {f === 'all' ? 'Tous' : CHANTIER_STATUS_LABEL[f]}
                <span className="tabular-nums opacity-70">{counts.get(f) ?? 0}</span>
              </button>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="bati-card rounded-2xl p-8 text-center text-sm text-bati-muted">
          Aucun chantier ne correspond à votre recherche.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {visible.map((c) => (
            <ProjectTile
              key={c.id}
              chantier={c}
              preview={byId.get(c.id)}
              loading={isLoading}
              href={getHref(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── tile ────────────────────────────────────────────────────────────────

interface ProjectTileProps {
  chantier: Chantier;
  preview: ChantierPreview | undefined;
  loading: boolean;
  href: string;
}

function ProjectTile({ chantier, preview, loading, href }: ProjectTileProps) {
  const pct = preview?.budgetPct ?? null;
  const health = getBudgetHealth(pct ?? NaN);
  const barW = pct == null ? 0 : Math.min(100, Math.max(0, pct * 100));
  const pctLabel = pct == null ? '—' : `${Math.round(pct * 100)} %`;
  const tasksLabel =
    preview && preview.tasksTotal > 0
      ? `${preview.tasksDone} / ${preview.tasksTotal} tâches`
      : '—';

  return (
    <Link
      to={href}
      className="relative block bati-card bati-elev-hover rounded-2xl p-4 pl-5 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-bati-primary"
    >
      <span
        className="absolute left-0 top-0 bottom-0 w-1.5"
        style={{ background: chantier.color ?? 'var(--bati-primary)' }}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-bati-text truncate">{chantier.name}</h3>
          {chantier.client_name && (
            <div className="text-xs text-bati-muted truncate mt-0.5">
              {chantier.client_name}
            </div>
          )}
        </div>
        <StatusBadge status={chantier.status} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-2xl font-bold tabular-nums text-bati-text">
            {loading ? '—' : preview?.presentToday ?? 0}
          </span>
          <span className="text-xs text-bati-muted truncate">
            présents aujourd&apos;hui
          </span>
        </div>
        {preview?.riskLevel && <RiskBadge level={preview.riskLevel} />}
      </div>

      <Progress label="Budget consommé" value={loading ? '—' : pctLabel}>
        <div
          className={`h-full rounded-full ${HEALTH_BAR_BG[health]}`}
          style={{ width: `${barW}%` }}
        />
      </Progress>

      <Footer>
        <Stat label="Avancement" value={loading ? '—' : tasksLabel} />
        <Stat
          label="Prochaine échéance"
          align="right"
          value={loading ? '—' : formatDate(preview?.nextDeadline ?? null)}
        />
      </Footer>
    </Link>
  );
}

// ── small layout helpers ──────────────────────────────────────────────────

function Progress({
  label,
  value,
  children,
}: {
  label: string;
  value: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mt-3">
      <div className="flex justify-between text-[11px] mb-1.5">
        <span className="text-bati-muted">{label}</span>
        <span className="font-semibold text-bati-text tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-bati-border-soft overflow-hidden">{children}</div>
    </div>
  );
}

function Footer({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3.5 pt-3 border-t border-bati-border-soft grid grid-cols-2 gap-2">
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  align = 'left',
  valueClass = 'text-bati-text',
}: {
  label: string;
  value: ReactNode;
  align?: 'left' | 'right';
  valueClass?: string;
}) {
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <div className="text-[10px] uppercase tracking-wide text-bati-muted">{label}</div>
      <div className={`text-[13px] font-bold mt-0.5 tabular-nums ${valueClass}`}>{value}</div>
    </div>
  );
}
