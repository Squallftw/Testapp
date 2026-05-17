import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import {
  listConsumption,
  listItems,
  type Consumption,
  type ConsumablesItem,
} from '@/data/consumables';
import { materialsSpent } from '@/data/budget-engine';
import { useOrg } from '@/contexts/OrgContext';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDateShort, formatMAD } from '@/lib/format';

interface ChantierConsumablesViewProps {
  chantierId: string;
}

const RECENT_LIMIT = 20;

/**
 * Chantier-scoped consumables summary. Shows only consumption (real per-chantier
 * spend); achats are deliberately excluded because purchases are typically made
 * for the depot and only become chantier-scoped once consumed. Org-wide article,
 * supplier, achat, and movement management lives at /consommables/*.
 */
export function ChantierConsumablesView({ chantierId }: ChantierConsumablesViewProps) {
  const { activeOrg } = useOrg();

  const consumption = useQuery({
    queryKey: ['consumption', activeOrg?.id, chantierId],
    queryFn: () => listConsumption({ chantierId }),
    enabled: !!activeOrg,
  });

  const items = useQuery({
    queryKey: ['consumables-items', activeOrg?.id],
    queryFn: () => listItems(),
    enabled: !!activeOrg,
  });

  const materials = useQuery({
    queryKey: ['materials-spent', activeOrg?.id, chantierId],
    queryFn: () => materialsSpent(chantierId),
    enabled: !!activeOrg,
  });

  const itemById = useMemo(
    () => new Map((items.data ?? []).map((i) => [i.id, i])),
    [items.data]
  );

  const recentConsumption = useMemo(
    () => (consumption.data ?? []).slice(0, RECENT_LIMIT),
    [consumption.data]
  );

  const lastActivityIso = consumption.data?.[0]?.used_at ?? null;

  const lossCount = useMemo(
    () => (consumption.data ?? []).filter((c) => c.is_loss).length,
    [consumption.data]
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard
          label="Coût matériaux"
          value={formatMAD(materials.data ?? 0)}
          accent="terra"
        />
        <SummaryCard
          label="Nb consommations"
          value={(consumption.data ?? []).length}
          accent="ochre"
          subtitle={lossCount > 0 ? `dont ${lossCount} perte${lossCount > 1 ? 's' : ''}` : undefined}
        />
        <SummaryCard
          label="Dernière consommation"
          value={lastActivityIso ? formatDateShort(lastActivityIso) : '—'}
          accent="success"
        />
      </div>

      <Section
        title="Consommation récente"
        cta={
          <Link
            to={`/consommables/consommation?chantier=${chantierId}`}
            className="text-xs text-bati-teal hover:underline"
          >
            Toutes les consommations →
          </Link>
        }
      >
        <ConsumptionTable
          rows={recentConsumption}
          itemById={itemById}
          isLoading={consumption.isLoading}
        />
      </Section>

      <div className="bati-card rounded-lg p-4 text-sm text-bati-muted flex items-center justify-between">
        <span>Articles, achats, fournisseurs et mouvements sont gérés au niveau de l&apos;organisation.</span>
        <Link
          to="/consommables/articles"
          className="text-bati-teal hover:underline font-medium whitespace-nowrap ml-3"
        >
          Ouvrir les consommables →
        </Link>
      </div>
    </div>
  );
}

const ACCENT_CLASS: Record<string, string> = {
  teal: 'text-bati-teal',
  terra: 'text-bati-terra',
  ochre: 'text-bati-ochre',
  success: 'text-bati-success',
};

function SummaryCard({
  label,
  value,
  accent,
  subtitle,
}: {
  label: string;
  value: React.ReactNode;
  accent: 'teal' | 'terra' | 'ochre' | 'success';
  subtitle?: string;
}) {
  return (
    <div className="bati-card rounded-lg p-4">
      <div className="text-xs uppercase tracking-wide text-bati-muted">{label}</div>
      <div className={`text-xl font-bold mt-2 tabular-nums ${ACCENT_CLASS[accent]}`}>
        {value}
      </div>
      {subtitle && <div className="text-xs text-bati-muted mt-1">{subtitle}</div>}
    </div>
  );
}

function Section({
  title,
  cta,
  children,
}: {
  title: string;
  cta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-bati-text">{title}</h3>
        {cta}
      </div>
      {children}
    </div>
  );
}

const consumptionHelper = createColumnHelper<Consumption>();

function ConsumptionTable({
  rows,
  itemById,
  isLoading,
}: {
  rows: Consumption[];
  itemById: Map<string, ConsumablesItem>;
  isLoading: boolean;
}) {
  const columns = useMemo(
    () => [
      consumptionHelper.accessor('used_at', {
        header: 'Date',
        cell: (info) => formatDateShort(info.getValue()),
      }),
      consumptionHelper.accessor((row) => row.item_id, {
        id: 'item',
        header: 'Article',
        cell: (info) => {
          const id = info.getValue();
          const it = itemById.get(id);
          return it?.name ?? <span className="text-bati-muted">Inconnu</span>;
        },
      }),
      consumptionHelper.accessor('qty', {
        header: 'Quantité',
        cell: (info) => {
          const row = info.row.original;
          const it = itemById.get(row.item_id);
          const unit = it?.unit ?? '';
          return (
            <span className="tabular-nums">
              {info.getValue()} {unit}
            </span>
          );
        },
      }),
      consumptionHelper.accessor('is_loss', {
        header: 'Type',
        cell: (info) =>
          info.getValue() ? (
            <span className="text-xs font-medium text-bati-terra">Perte</span>
          ) : (
            <span className="text-bati-muted text-xs">Normale</span>
          ),
      }),
      consumptionHelper.accessor('notes', {
        header: 'Notes',
        cell: (info) => {
          const n = info.getValue();
          if (!n) return <span className="text-bati-muted">—</span>;
          return (
            <span className="text-bati-muted truncate max-w-[16rem] inline-block align-middle">
              {n}
            </span>
          );
        },
      }),
    ],
    [itemById]
  );

  return (
    <DataTable
      data={rows}
      columns={columns}
      isLoading={isLoading}
      empty={
        <EmptyState
          title="Aucune consommation"
          description="Les sorties de stock attribuées à ce chantier apparaîtront ici."
        />
      }
    />
  );
}
