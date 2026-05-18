import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getChantier, softDeleteChantier } from '@/data/chantiers';
import { useChantier } from '@/contexts/ChantierContext';
import { useOrg } from '@/contexts/OrgContext';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { formatMAD, formatDate } from '@/lib/format';
import { PlanningView } from '@/pages/planning/PlanningView';
import { PointageView } from '@/pages/pointage/PointageView';
import { ChantierConsumablesView } from '@/pages/consommables/ChantierConsumablesView';
import { ChantierBudgetView } from '@/pages/budget/ChantierBudgetView';
import { ChantierMaterielsView } from '@/pages/materiels/ChantierMaterielsView';

type Tab =
  | 'overview'
  | 'planning'
  | 'pointage'
  | 'consommables'
  | 'materiels'
  | 'budget';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Vue d\'ensemble' },
  { id: 'planning', label: 'Planning' },
  { id: 'pointage', label: 'Pointage' },
  { id: 'consommables', label: 'Matériaux' },
  { id: 'materiels', label: 'Matériels' },
  { id: 'budget', label: 'Budget' },
];

export default function ChantierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { myRole } = useOrg();
  const { setActiveChantier } = useChantier();
  const [tab, setTab] = useState<Tab>('overview');
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

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <Link
          to="/chantiers"
          className="text-xs text-bati-muted hover:text-bati-text inline-flex items-center gap-1"
        >
          <span aria-hidden>←</span> Retour aux chantiers
        </Link>
      </div>

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
          <button
            type="button"
            onClick={() => {
              setActiveChantier(c.id);
              toast.success(`Chantier actif : ${c.name}`);
            }}
            className="px-3 py-1.5 text-sm border border-bati-border bg-bati-card rounded-md hover:bg-bati-border-soft"
          >
            Définir comme chantier actif
          </button>
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

      <div className="flex border-b border-bati-border overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? 'border-bati-teal text-bati-teal'
                : 'border-transparent text-bati-muted hover:text-bati-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <InfoCard title="Informations">
            <InfoRow label="Chef de chantier" value={c.manager_name} />
            <InfoRow label="Client" value={c.client_name} />
            <InfoRow label="Adresse" value={c.address} />
            <InfoRow label="Type" value={c.type} />
          </InfoCard>
          <InfoCard title="Calendrier">
            <InfoRow label="Date de début" value={formatDate(c.date_start)} />
            <InfoRow label="Date de fin prévue" value={formatDate(c.date_end_prev)} />
            <InfoRow label="Créé le" value={formatDate(c.created_at)} />
          </InfoCard>
          <InfoCard title="Budget">
            <InfoRow label="Budget total" value={formatMAD(c.budget_total)} highlight />
            <InfoRow label="Main d'œuvre" value={formatMAD(c.budget_labor)} />
            <InfoRow label="Matériaux" value={formatMAD(c.budget_materials)} />
            <InfoRow label="Matériels" value={formatMAD(c.budget_equipment)} />
            <InfoRow
              label="Divers (calc.)"
              value={formatMAD(
                c.budget_total - c.budget_labor - c.budget_materials - c.budget_equipment
              )}
            />
          </InfoCard>
          <InfoCard title="Contrat">
            <InfoRow label="Valeur du contrat" value={formatMAD(c.contract_value)} />
            <InfoRow
              label="Marge potentielle"
              value={formatMAD(c.contract_value - c.budget_total)}
            />
          </InfoCard>
        </div>
      )}

      {tab === 'planning' && <PlanningView chantierId={c.id} />}
      {tab === 'pointage' && <PointageView chantierId={c.id} />}
      {tab === 'consommables' && <ChantierConsumablesView chantierId={c.id} />}
      {tab === 'materiels' && <ChantierMaterielsView chantierId={c.id} />}
      {tab === 'budget' && (
        <ChantierBudgetView chantier={c} onNavigateTab={(t) => setTab(t)} />
      )}

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

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bati-card rounded-lg p-5">
      <h3 className="text-xs uppercase tracking-wide text-bati-muted mb-3">{title}</h3>
      <dl className="space-y-2">{children}</dl>
    </div>
  );
}

function InfoRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline gap-3 text-sm">
      <dt className="text-bati-muted">{label}</dt>
      <dd
        className={`text-right tabular-nums ${
          highlight ? 'font-bold text-bati-text' : 'text-bati-text'
        }`}
      >
        {value || <span className="text-bati-muted">—</span>}
      </dd>
    </div>
  );
}

