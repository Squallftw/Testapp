import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import {
  hueToColor,
  listWorkers,
  WORKER_STATUS_LABEL,
  type Worker,
  type WorkerStatus,
} from '@/data/workers';
import { useOrg } from '@/contexts/OrgContext';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatMADPrecise, formatDateShort } from '@/lib/format';

const STATUS_FILTERS: Array<{ value: 'all' | WorkerStatus; label: string }> = [
  { value: 'all', label: 'Tous' },
  { value: 'active', label: 'Actifs' },
  { value: 'inactive', label: 'Inactifs' },
];

const columnHelper = createColumnHelper<Worker>();

export default function WorkersListPage() {
  const { activeOrg } = useOrg();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | WorkerStatus>('active');

  const query = useQuery({
    queryKey: ['workers', activeOrg?.id],
    queryFn: () => listWorkers(),
    enabled: !!activeOrg,
  });

  const filtered = useMemo(() => {
    const all = query.data ?? [];
    if (statusFilter === 'all') return all;
    return all.filter((w) => w.status === statusFilter);
  }, [query.data, statusFilter]);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'hue',
        header: '',
        cell: (info) => (
          <div
            className="w-2 h-6 rounded-sm"
            style={{ background: hueToColor(info.row.original.hue) }}
            aria-hidden
          />
        ),
        enableSorting: false,
      }),
      columnHelper.accessor('full_name', {
        header: 'Nom',
        cell: (info) => (
          <Link
            to={`/ouvriers/${info.row.original.id}/edit`}
            className="font-medium text-bati-text hover:text-bati-teal hover:underline"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor('role', {
        header: 'Métier',
        cell: (info) => info.getValue() ?? <span className="text-bati-muted">—</span>,
      }),
      columnHelper.accessor('daily_rate', {
        header: 'Taux journalier',
        cell: (info) => (
          <span className="tabular-nums">{formatMADPrecise(info.getValue())}</span>
        ),
      }),
      columnHelper.accessor('status', {
        header: 'Statut',
        cell: (info) => {
          const s = info.getValue();
          return (
            <span
              className={
                s === 'active'
                  ? 'text-bati-success text-xs font-medium'
                  : 'text-bati-muted text-xs'
              }
            >
              {WORKER_STATUS_LABEL[s]}
            </span>
          );
        },
      }),
      columnHelper.accessor('phone', {
        header: 'Téléphone',
        cell: (info) => info.getValue() ?? <span className="text-bati-muted">—</span>,
      }),
      columnHelper.accessor('hire_date', {
        header: 'Embauche',
        cell: (info) => (
          <span className="text-bati-muted text-xs">
            {formatDateShort(info.getValue())}
          </span>
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
          <h1 className="text-2xl font-bold text-bati-text">Ouvriers</h1>
          <p className="text-sm text-bati-muted mt-0.5">
            {query.data ? `${query.data.length} ouvrier(s)` : 'Chargement…'}
          </p>
        </div>
        <Link
          to="/ouvriers/new"
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
          Nouvel ouvrier
        </Link>
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
        searchPlaceholder="Rechercher un ouvrier…"
        empty={
          <EmptyState
            title={
              query.data && query.data.length === 0
                ? 'Aucun ouvrier'
                : 'Aucun ouvrier ne correspond aux filtres'
            }
            description={
              query.data && query.data.length === 0
                ? 'Ajoutez vos premiers ouvriers pour commencer à enregistrer le pointage.'
                : undefined
            }
            action={
              query.data && query.data.length === 0 ? (
                <Link
                  to="/ouvriers/new"
                  className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium"
                >
                  Ajouter un ouvrier
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
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
              </svg>
            }
          />
        }
      />
    </div>
  );
}
