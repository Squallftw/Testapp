import { Link } from 'react-router-dom';
import type { Chantier } from '@/data/chantiers';
import type { BudgetSummary } from '@/data/budget-engine';
import type { ConsumablesItem } from '@/data/consumables';
import type { TaskWithAssignments } from '@/data/tasks';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDateShort, formatMAD } from '@/lib/format';

export type KpiKey = 'active' | 'present' | 'alerts' | 'cash';

interface PanelWrapperProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function KpiDetailPanel({ title, onClose, children }: PanelWrapperProps) {
  return (
    <div className="bati-card bati-elev-1 rounded-xl p-5 border-bati-teal/30">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-bold text-bati-text">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-bati-muted hover:text-bati-text"
          aria-label="Fermer le panneau"
        >
          Fermer ✕
        </button>
      </div>
      {children}
    </div>
  );
}

// ─── Active chantiers ─────────────────────────────────────────────────

export function ActiveChantiersDetail({
  chantiers,
  summariesById,
}: {
  chantiers: Chantier[];
  summariesById: Map<string, BudgetSummary>;
}) {
  if (chantiers.length === 0) {
    return (
      <EmptyState
        title="Aucun chantier actif"
        description="Tous vos chantiers sont en pause, terminés ou annulés."
      />
    );
  }
  return (
    <ul className="divide-y divide-bati-border-soft">
      {chantiers.map((c) => {
        const s = summariesById.get(c.id);
        const cash = s ? s.payments_received - s.total_spent : 0;
        return (
          <li key={c.id}>
            <Link
              to={`/chantiers/${c.id}`}
              className="flex items-center justify-between gap-3 py-2 hover:bg-bati-border-soft/40 -mx-2 px-2 rounded-md transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-1.5 h-6 rounded-full shrink-0"
                  style={{ background: c.color ?? 'var(--bati-border)' }}
                  aria-hidden
                />
                <span className="text-sm font-medium text-bati-text truncate">
                  {c.name}
                </span>
                {c.client_name && (
                  <span className="text-xs text-bati-muted truncate">
                    · {c.client_name}
                  </span>
                )}
              </div>
              <span
                className={`text-xs tabular-nums font-semibold ${
                  cash >= 0 ? 'text-bati-success' : 'text-bati-terra'
                }`}
              >
                {cash >= 0 ? '+' : '−'} {formatMAD(Math.abs(cash))}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Present today ────────────────────────────────────────────────────

export function PresentTodayDetail({
  chantiers,
  presentByChantier,
}: {
  chantiers: Chantier[];
  presentByChantier: Map<string, number>;
}) {
  const rows = chantiers
    .map((c) => ({ chantier: c, count: presentByChantier.get(c.id) ?? 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Aucun pointage aujourd'hui"
        description="Aucun ouvrier n'a été marqué présent aujourd'hui sur vos chantiers actifs."
        action={
          <Link
            to="/pointage"
            className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium hover:opacity-90"
          >
            Ouvrir le pointage
          </Link>
        }
      />
    );
  }
  return (
    <ul className="divide-y divide-bati-border-soft">
      {rows.map(({ chantier, count }) => (
        <li key={chantier.id}>
          <Link
            to={`/chantiers/${chantier.id}`}
            className="flex items-center justify-between gap-3 py-2 hover:bg-bati-border-soft/40 -mx-2 px-2 rounded-md transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-1.5 h-6 rounded-full shrink-0"
                style={{ background: chantier.color ?? 'var(--bati-border)' }}
                aria-hidden
              />
              <span className="text-sm font-medium text-bati-text truncate">
                {chantier.name}
              </span>
            </div>
            <span className="text-sm tabular-nums font-bold text-bati-success">
              {count}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ─── Alerts ───────────────────────────────────────────────────────────

export interface OverBudgetItem {
  chantier: Chantier;
  spent: number;
  over: number; // spent - budget_total
}
export interface LowStockItem {
  item: ConsumablesItem;
  onHand: number;
  threshold: number;
}
export interface OverdueTaskItem {
  task: TaskWithAssignments;
  chantier: Chantier;
  endIso: string;
  daysOverdue: number;
}

export function AlertsDetail({
  overBudget,
  lowStock,
  overdueTasks,
}: {
  overBudget: OverBudgetItem[];
  lowStock: LowStockItem[];
  overdueTasks: OverdueTaskItem[];
}) {
  const isEmpty =
    overBudget.length === 0 && lowStock.length === 0 && overdueTasks.length === 0;
  if (isEmpty) {
    return (
      <EmptyState
        title="Aucune alerte ouverte"
        description="Tous les budgets, stocks et tâches sont dans les clous."
      />
    );
  }

  return (
    <div className="space-y-4">
      {overBudget.length > 0 && (
        <AlertSection title={`Chantiers en dépassement (${overBudget.length})`}>
          {overBudget.map((a) => (
            <Link
              key={a.chantier.id}
              to={`/chantiers/${a.chantier.id}`}
              className="flex items-center justify-between gap-3 py-1.5 hover:bg-bati-border-soft/40 -mx-2 px-2 rounded-md transition-colors"
            >
              <span className="text-sm text-bati-text truncate">
                {a.chantier.name}
              </span>
              <span className="text-xs font-semibold text-bati-terra tabular-nums whitespace-nowrap">
                +{formatMAD(a.over)} au-dessus
              </span>
            </Link>
          ))}
        </AlertSection>
      )}
      {lowStock.length > 0 && (
        <AlertSection title={`Articles sous le seuil (${lowStock.length})`}>
          {lowStock.map((a) => (
            <Link
              key={a.item.id}
              to="/consommables/articles"
              className="flex items-center justify-between gap-3 py-1.5 hover:bg-bati-border-soft/40 -mx-2 px-2 rounded-md transition-colors"
            >
              <span className="text-sm text-bati-text truncate">{a.item.name}</span>
              <span className="text-xs text-bati-ochre tabular-nums whitespace-nowrap">
                {a.onHand} / {a.threshold} {a.item.unit ?? ''}
              </span>
            </Link>
          ))}
        </AlertSection>
      )}
      {overdueTasks.length > 0 && (
        <AlertSection title={`Tâches en retard (${overdueTasks.length})`}>
          {overdueTasks.map(({ task, chantier, endIso, daysOverdue }) => (
            <Link
              key={task.id}
              to={`/chantiers/${chantier.id}`}
              className="flex items-center justify-between gap-3 py-1.5 hover:bg-bati-border-soft/40 -mx-2 px-2 rounded-md transition-colors"
            >
              <span className="text-sm text-bati-text truncate">
                {task.label}{' '}
                <span className="text-bati-muted text-xs">· {chantier.name}</span>
              </span>
              <span className="text-xs text-bati-terra tabular-nums whitespace-nowrap">
                {daysOverdue}j (échéance {formatDateShort(endIso)})
              </span>
            </Link>
          ))}
        </AlertSection>
      )}
    </div>
  );
}

function AlertSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-xs uppercase tracking-wide text-bati-muted mb-1">
        {title}
      </h4>
      <div className="divide-y divide-bati-border-soft">{children}</div>
    </div>
  );
}

// ─── Cash position ────────────────────────────────────────────────────

export function CashPositionDetail({
  chantiers,
  summariesById,
}: {
  chantiers: Chantier[];
  summariesById: Map<string, BudgetSummary>;
}) {
  const rows = chantiers
    .map((c) => {
      const s = summariesById.get(c.id);
      const received = s?.payments_received ?? 0;
      const spent = s?.total_spent ?? 0;
      return { chantier: c, received, spent, cash: received - spent };
    })
    .filter((r) => r.received > 0 || r.spent > 0)
    .sort((a, b) => a.cash - b.cash); // worst first

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Aucun flux financier"
        description="Aucun chantier n'a encore d'achats, de pointage ou de paiements enregistrés."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-bati-muted text-left border-b border-bati-border-soft">
            <th className="py-2 pr-3 font-medium">Chantier</th>
            <th className="py-2 px-3 font-medium text-right">Reçu</th>
            <th className="py-2 px-3 font-medium text-right">Engagé</th>
            <th className="py-2 pl-3 font-medium text-right">Position</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bati-border-soft">
          {rows.map((r) => (
            <tr key={r.chantier.id}>
              <td className="py-2 pr-3">
                <Link
                  to={`/chantiers/${r.chantier.id}`}
                  className="flex items-center gap-2 hover:text-bati-teal"
                >
                  <span
                    className="w-1.5 h-4 rounded-full shrink-0"
                    style={{
                      background: r.chantier.color ?? 'var(--bati-border)',
                    }}
                    aria-hidden
                  />
                  <span className="truncate text-bati-text">
                    {r.chantier.name}
                  </span>
                  <StatusBadge status={r.chantier.status} />
                </Link>
              </td>
              <td className="py-2 px-3 text-right tabular-nums text-bati-muted">
                {formatMAD(r.received)}
              </td>
              <td className="py-2 px-3 text-right tabular-nums text-bati-muted">
                {formatMAD(r.spent)}
              </td>
              <td
                className={`py-2 pl-3 text-right tabular-nums font-semibold ${
                  r.cash >= 0 ? 'text-bati-success' : 'text-bati-terra'
                }`}
              >
                {r.cash >= 0 ? '+' : '−'} {formatMAD(Math.abs(r.cash))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
