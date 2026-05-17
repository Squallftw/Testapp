import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { listChantiers, type Chantier, type ChantierStatus } from '@/data/chantiers';
import { useOrg } from '@/contexts/OrgContext';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatMAD, formatDateShort } from '@/lib/format';

const STATUS_FILTERS: Array<{ value: 'all' | ChantierStatus; label: string }> = [
  { value: 'all', label: 'Tous' },
  { value: 'active', label: 'En cours' },
  { value: 'paused', label: 'En pause' },
  { value: 'completed', label: 'Terminés' },
  { value: 'cancelled', label: 'Annulés' },
];

const columnHelper = createColumnHelper<Chantier>();

export default function ChantiersListPage() {
  const { activeOrg, myRole } = useOrg();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ChantierStatus>('all');
  const canCreate = myRole === 'owner' || myRole === 'admin';

  const query = useQuery({
    queryKey: ['chantiers', activeOrg?.id],
    queryFn: () => listChantiers(),
    enabled: !!activeOrg,
  });

  const filtered = useMemo(() => {
    const all = query.data ?? [];
    if (statusFilter === 'all') return all;
    return all.filter((c) => c.status === statusFilter);
  }, [query.data, statusFilter]);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'color',
        header: '',
        cell: (info) => (
          <div
            className="w-2 h-6 rounded-sm"
            style={{ background: info.row.original.color ?? 'var(--bati-border)' }}
            aria-hidden
          />
        ),
        enableSorting: false,
      }),
      columnHelper.accessor('name', {
        header: 'Nom',
        cell: (info) => (
          <Link
            to={`/chantiers/${info.row.original.id}`}
            className="font-medium text-bati-text hover:text-bati-teal hover:underline"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor('status', {
        header: 'Statut',
        cell: (info) => <StatusBadge status={info.getValue()} />,
      }),
      columnHelper.accessor('client_name', {
        header: 'Client',
        cell: (info) => info.getValue() ?? <span className="text-bati-muted">—</span>,
      }),
      columnHelper.accessor('manager_name', {
        header: 'Chef de chantier',
        cell: (info) => info.getValue() ?? <span className="text-bati-muted">—</span>,
      }),
      columnHelper.accessor('budget_total', {
        header: 'Budget',
        cell: (info) => (
          <span className="tabular-nums">{formatMAD(info.getValue())}</span>
        ),
      }),
      columnHelper.accessor('date_start', {
        header: 'Début',
        cell: (info) => (
          <span className="text-bati-muted text-xs">{formatDateShort(info.getValue())}</span>
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
          query.error instanceof Error
            ? query.error.message
            : 'Impossible de charger les chantiers.'
        }
        action={
          <button
            type="button"
            onClick={() => query.refetch()}
            className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm hover:opacity-90"
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
          <h1 className="text-2xl font-bold text-bati-text">Chantiers</h1>
          <p className="text-sm text-bati-muted mt-0.5">
            {query.data ? `${query.data.length} chantier(s)` : 'Chargement…'}
          </p>
        </div>
        {canCreate && (
          <Link
            to="/chantiers/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
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
            Nouveau chantier
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              statusFilter === f.value
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
        searchPlaceholder="Rechercher un chantier…"
        empty={
          <EmptyState
            title={
              query.data && query.data.length === 0
                ? 'Aucun chantier'
                : 'Aucun chantier ne correspond aux filtres'
            }
            description={
              query.data && query.data.length === 0
                ? "Créez votre premier chantier pour commencer à enregistrer pointage, dépenses et avancement."
                : 'Modifiez les filtres pour voir plus de résultats.'
            }
            action={
              canCreate && query.data && query.data.length === 0 ? (
                <Link
                  to="/chantiers/new"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium"
                >
                  Créer un chantier
                </Link>
              ) : undefined
            }
            icon={
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-7h6v7" />
              </svg>
            }
          />
        }
      />
    </div>
  );
}
