import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import {
  listMateriels,
  MATERIEL_KIND_LABEL,
  softDeleteMateriel,
  type Materiel,
  type MaterielKind,
} from '@/data/materiels';
import { useOrg } from '@/contexts/OrgContext';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatMADPrecise } from '@/lib/format';
import { MaterielEditModal } from './MaterielEditModal';

type KindFilter = 'all' | MaterielKind;

const KIND_FILTERS: Array<{ value: KindFilter; label: string }> = [
  { value: 'all', label: 'Tous' },
  { value: 'loue', label: 'Loués' },
  { value: 'possede', label: 'Possédés' },
];

const columnHelper = createColumnHelper<Materiel>();

export default function MaterielsListPage() {
  const { activeOrg } = useOrg();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [editing, setEditing] = useState<Materiel | null | undefined>(undefined);

  const query = useQuery({
    queryKey: ['materiels', activeOrg?.id],
    queryFn: () => listMateriels(),
    enabled: !!activeOrg,
  });

  const filtered = useMemo(() => {
    const all = query.data ?? [];
    if (kindFilter === 'all') return all;
    return all.filter((m) => m.type === kindFilter);
  }, [query.data, kindFilter]);

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Nom',
        cell: (info) => (
          <button
            type="button"
            onClick={() => setEditing(info.row.original)}
            className="font-medium text-bati-text hover:text-bati-teal hover:underline text-left"
          >
            {info.getValue()}
          </button>
        ),
      }),
      columnHelper.accessor('type', {
        header: 'Type',
        cell: (info) => {
          const t = info.getValue();
          return (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                t === 'loue'
                  ? 'bg-bati-teal-soft text-bati-teal'
                  : 'border border-bati-border text-bati-muted'
              }`}
            >
              {MATERIEL_KIND_LABEL[t]}
            </span>
          );
        },
      }),
      columnHelper.accessor('category', {
        header: 'Catégorie',
        cell: (info) => info.getValue() ?? <span className="text-bati-muted">—</span>,
      }),
      columnHelper.display({
        id: 'qty',
        header: 'Quantité',
        cell: (info) => {
          const m = info.row.original;
          if (m.qty == null) return <span className="text-bati-muted">—</span>;
          return (
            <span className="tabular-nums">
              {m.qty} {m.unit ? <span className="text-bati-muted">{m.unit}</span> : null}
            </span>
          );
        },
      }),
      columnHelper.accessor('cost_per_day', {
        header: 'Coût/jour',
        cell: (info) => (
          <span className="tabular-nums">{formatMADPrecise(info.getValue())}</span>
        ),
      }),
    ],
    []
  );

  if (query.isError) {
    return (
      <EmptyState
        title="Erreur de chargement"
        description={
          query.error instanceof Error ? query.error.message : 'Erreur inconnue.'
        }
        action={
          <button
            type="button"
            onClick={() => query.refetch()}
            className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm"
          >
            Réessayer
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-bati-text">Matériels</h1>
          <p className="text-sm text-bati-muted mt-0.5">
            {query.data
              ? `${query.data.length} matériel(s) — loués et possédés`
              : 'Chargement…'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(null)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium hover:opacity-90"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Nouveau matériel
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {KIND_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setKindFilter(f.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              kindFilter === f.value
                ? 'bg-bati-teal text-white'
                : 'bg-bati-card border border-bati-border text-bati-muted hover:bg-bati-border-soft'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        isLoading={query.isLoading}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Rechercher un matériel…"
        bulkDelete={{
          confirmTitle: (n) => `Supprimer ${n} matériel${n > 1 ? 's' : ''} ?`,
          confirmDescription: (n) =>
            `${n} matériel${n > 1 ? 's seront archivés' : ' sera archivé'} et n'apparaîtra plus dans l'inventaire ni lors des nouveaux déploiements. Les déploiements historiques continuent d'être comptabilisés.`,
          successMessage: (n) => `${n} matériel${n > 1 ? 's' : ''} archivé${n > 1 ? 's' : ''}`,
          onConfirm: async (selected) => {
            await Promise.all(selected.map((m) => softDeleteMateriel(m.id)));
            await queryClient.invalidateQueries({ queryKey: ['materiels'] });
            await queryClient.invalidateQueries({ queryKey: ['budget-summaries'] });
          },
        }}
        empty={
          <EmptyState
            title={
              query.data && query.data.length === 0
                ? 'Aucun matériel'
                : 'Aucun matériel ne correspond aux filtres'
            }
            description={
              query.data && query.data.length === 0
                ? 'Ajoutez vos premiers matériels (bétonnière, échafaudage, camion benne…) pour commencer à imputer leurs coûts aux chantiers.'
                : undefined
            }
            action={
              query.data && query.data.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium"
                >
                  Ajouter un matériel
                </button>
              ) : undefined
            }
          />
        }
      />

      {editing !== undefined && (
        <MaterielEditModal
          materiel={editing}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}
