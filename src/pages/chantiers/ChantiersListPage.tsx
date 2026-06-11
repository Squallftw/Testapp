import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listChantiers } from '@/data/chantiers';
import { useOrg } from '@/contexts/OrgContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { ChantierPickerGrid } from '@/components/chantiers/ChantierPickerGrid';

/**
 * The single door to everything project-scoped: a searchable grid of project
 * tiles with at-a-glance health (présents, risque, budget, avancement).
 * Archiving lives on the detail page (Supprimer, with confirm).
 */
export default function ChantiersListPage() {
  const { activeOrg, myRole } = useOrg();
  const canCreate = myRole === 'owner' || myRole === 'admin';

  const query = useQuery({
    queryKey: ['chantiers', activeOrg?.id],
    queryFn: () => listChantiers(),
    enabled: !!activeOrg,
  });

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
          <Button onClick={() => query.refetch()}>Réessayer</Button>
        }
      />
    );
  }

  const chantiers = query.data ?? [];

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
            className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium bg-bati-teal text-white hover:bg-bati-teal-deep active:translate-y-[1px] shadow-sm hover:shadow transition-[background-color,opacity,transform,box-shadow] duration-150"
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

      {query.isLoading ? (
        <div className="text-sm text-bati-muted">Chargement…</div>
      ) : chantiers.length === 0 ? (
        <EmptyState
          title="Aucun chantier"
          description="Créez votre premier chantier pour commencer à enregistrer pointage, dépenses et avancement."
          action={
            canCreate ? (
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
      ) : (
        <ChantierPickerGrid
          chantiers={chantiers}
          getHref={(id) => `/chantiers/${id}`}
        />
      )}
    </div>
  );
}
