import { Suspense, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getChantier, softDeleteChantier } from '@/data/chantiers';
import type { ChantierDetailContext } from './chantier-detail-context';
import { useOrg } from '@/contexts/OrgContext';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';

/* Tab nav — relative NavLinks resolved against the /chantiers/:id layout
   route. The index ('.') is the overview; the rest are nested segments, so
   every tab is deep-linkable and survives a refresh (routes in App.tsx,
   panels in ./detail-tabs.tsx). */
const TABS: Array<{ to: string; end?: boolean; label: string }> = [
  { to: '.', end: true, label: "Vue d'ensemble" },
  { to: 'planning', label: 'Planning' },
  { to: 'pointage', label: 'Pointage' },
  { to: 'materiaux', label: 'Matériaux' },
  { to: 'materiels', label: 'Matériels' },
  { to: 'budget', label: 'Budget' },
];

export default function ChantierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { myRole } = useOrg();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canEdit = myRole === 'owner' || myRole === 'admin';

  const query = useQuery({
    queryKey: ['chantier', id],
    queryFn: () => getChantier(id!),
    enabled: !!id,
  });

  const remove = useMutation({
    mutationFn: () => softDeleteChantier(id!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['chantiers'] });
      // The list page tiles read budget summaries — refresh them too so an
      // archived chantier doesn't leave stale aggregates behind.
      await queryClient.invalidateQueries({ queryKey: ['budget-summaries'] });
      toast.success('Chantier supprimé');
      navigate('/chantiers');
    },
    onError: (err) => toast.fromError(err, 'Échec de la suppression'),
  });

  if (query.isLoading) {
    return <div className="text-sm text-bati-muted">Chargement…</div>;
  }

  if (query.isError || !query.data) {
    return (
      <div className="bati-card rounded-lg p-6 max-w-md">
        <h2 className="text-base font-bold text-bati-terra">Chantier introuvable</h2>
        <p className="text-sm text-bati-muted mt-2">
          {query.error instanceof Error ? query.error.message : 'Erreur inconnue.'}
        </p>
        <Link
          to="/chantiers"
          className="mt-4 inline-block text-sm text-bati-teal hover:underline"
        >
          Retour à la liste
        </Link>
      </div>
    );
  }

  const c = query.data;
  const outletContext: ChantierDetailContext = { chantier: c };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="rounded-2xl border border-bati-border-soft bg-white/75 backdrop-blur-md shadow-sm p-5 md:p-6 space-y-5">
        <Link
          to="/chantiers"
          className="text-xs text-bati-muted hover:text-bati-text inline-flex items-center gap-1"
        >
          <span aria-hidden>←</span> Retour aux chantiers
        </Link>

        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className="w-1.5 self-stretch min-h-[3rem] rounded-full"
              style={{ background: c.color ?? 'var(--bati-border)' }}
              aria-hidden
            />
            <div>
              <h1 className="text-2xl font-bold text-bati-text">{c.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-bati-muted">
                <StatusBadge status={c.status} />
                {c.type && <span>{c.type}</span>}
                {c.client_name && (
                  <>
                    <span aria-hidden>·</span>
                    <span>Client : {c.client_name}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <>
                <Link
                  to={`/chantiers/${c.id}/edit`}
                  className="px-3 py-1.5 text-sm bg-bati-teal text-white rounded-md hover:opacity-90"
                >
                  Modifier
                </Link>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="px-3 py-1.5 text-sm text-bati-terra border border-bati-terra-soft rounded-md hover:bg-bati-terra-soft"
                >
                  Supprimer
                </button>
              </>
            )}
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto rounded-xl bg-bati-border-soft p-1">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `px-3.5 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-white text-bati-primary-deep font-semibold shadow-sm'
                    : 'font-medium text-bati-muted hover:text-bati-text'
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Local boundary so a tab chunk still loading never blanks the header. */}
      <Suspense fallback={null}>
        <Outlet context={outletContext} />
      </Suspense>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Supprimer ce chantier ?"
        description={
          <>
            Le chantier <strong>{c.name}</strong> sera archivé. Les données associées
            (pointage, matériaux, paiements) restent visibles dans l&apos;historique mais
            le chantier disparaît des listes. Cette action peut être annulée par un
            administrateur.
          </>
        }
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => remove.mutateAsync()}
      />
    </div>
  );
}
