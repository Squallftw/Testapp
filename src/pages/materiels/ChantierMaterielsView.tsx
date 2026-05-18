import { useMemo, useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import {
  deploymentCost,
  deploymentDays,
  listDeploymentsForChantier,
  listMateriels,
  MATERIEL_KIND_LABEL,
  softDeleteDeployment,
  type MaterielDeployment,
} from '@/data/materiels';
import { useOrg } from '@/contexts/OrgContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { useBulkSelection } from '@/components/ui/useBulkSelection';
import { formatDateShort, formatMAD } from '@/lib/format';
import { DeploymentEditModal } from './DeploymentEditModal';

interface ChantierMaterielsViewProps {
  chantierId: string;
}

export function ChantierMaterielsView({ chantierId }: ChantierMaterielsViewProps) {
  const { activeOrg } = useOrg();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<MaterielDeployment | null | undefined>(
    undefined
  );
  const [confirming, setConfirming] = useState(false);

  const [deploymentsQ, materielsQ] = useQueries({
    queries: [
      {
        queryKey: ['deployments', 'chantier', chantierId],
        queryFn: () => listDeploymentsForChantier(chantierId),
        enabled: !!activeOrg,
      },
      {
        queryKey: ['materiels', activeOrg?.id],
        queryFn: () => listMateriels(),
        enabled: !!activeOrg,
      },
    ],
  });

  const materielsById = useMemo(
    () => new Map((materielsQ.data ?? []).map((m) => [m.id, m])),
    [materielsQ.data]
  );

  const deployments = useMemo(
    () => deploymentsQ.data ?? [],
    [deploymentsQ.data]
  );

  const rows = useMemo(() => {
    return deployments.map((d) => {
      const m = materielsById.get(d.materiel_id);
      const days = deploymentDays(d.start_date, d.end_date);
      const cost = m ? deploymentCost(d, m.cost_per_day) : 0;
      return { deployment: d, materiel: m, days, cost };
    });
  }, [deployments, materielsById]);

  const totalCost = useMemo(() => rows.reduce((acc, r) => acc + r.cost, 0), [rows]);

  const selection = useBulkSelection(deployments);

  const isLoading = deploymentsQ.isLoading || materielsQ.isLoading;

  async function handleBulkDelete() {
    try {
      const items = selection.selected;
      await Promise.all(items.map((d) => softDeleteDeployment(d.id)));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['deployments', 'chantier', chantierId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['budget-summary', activeOrg?.id, chantierId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['budget-summaries', activeOrg?.id],
        }),
      ]);
      toast.success(
        `${items.length} déploiement${items.length > 1 ? 's' : ''} supprimé${items.length > 1 ? 's' : ''}`
      );
      selection.clear();
    } catch (err) {
      toast.fromError(err, 'Échec de la suppression');
      throw err;
    }
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-bold text-bati-text">
              Matériels déployés
            </h2>
            <p className="text-xs text-bati-muted mt-0.5">
              Bétonnières, échafaudages, camions… imputés au coût/jour défini sur
              chaque matériel.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="px-3 py-1.5 text-sm bg-bati-teal text-white rounded-md hover:opacity-90 whitespace-nowrap"
          >
            + Déployer un matériel
          </button>
        </div>

        {selection.selectedCount > 0 && (
          <div className="rounded-md border border-bati-teal/40 bg-bati-teal-soft/30 px-3 py-2 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-bati-text">
              {selection.selectedCount} sélectionné
              {selection.selectedCount > 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selection.clear}
                className="px-3 py-1 text-xs text-bati-muted hover:text-bati-text hover:bg-bati-border-soft rounded-md transition-colors"
              >
                Tout désélectionner
              </button>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="px-3 py-1 text-xs font-medium text-white bg-bati-terra rounded-md hover:opacity-90"
              >
                Supprimer ({selection.selectedCount})
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : deploymentsQ.isError ? (
          <p className="text-sm text-bati-terra py-3">
            {deploymentsQ.error instanceof Error
              ? deploymentsQ.error.message
              : 'Erreur de chargement'}
          </p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Aucun matériel déployé"
            description="Déployez votre premier matériel sur ce chantier pour suivre son coût quotidien."
            action={
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium"
              >
                Déployer un matériel
              </button>
            }
          />
        ) : (
          <div className="bati-card rounded-lg p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-bati-muted text-left border-b border-bati-border-soft">
                    <th className="py-2 pr-2 w-8">
                      <input
                        type="checkbox"
                        className="accent-bati-teal cursor-pointer"
                        aria-label="Tout sélectionner"
                        checked={selection.allSelected}
                        ref={(el) => {
                          if (el)
                            el.indeterminate =
                              selection.someSelected && !selection.allSelected;
                        }}
                        onChange={selection.toggleAll}
                      />
                    </th>
                    <th className="py-2 pr-3 font-medium">Matériel</th>
                    <th className="py-2 px-3 font-medium">Type</th>
                    <th className="py-2 px-3 font-medium">Période</th>
                    <th className="py-2 px-3 font-medium text-right">Qté</th>
                    <th className="py-2 px-3 font-medium text-right">Jours</th>
                    <th className="py-2 pl-3 font-medium text-right">Coût</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bati-border-soft">
                  {rows.map((r) => {
                    const checked = selection.isSelected(r.deployment.id);
                    return (
                      <tr
                        key={r.deployment.id}
                        className={`cursor-pointer ${
                          checked
                            ? 'bg-bati-teal-soft/30'
                            : 'hover:bg-bati-border-soft/40'
                        }`}
                        onClick={() => setEditing(r.deployment)}
                      >
                        <td
                          className="py-2 pr-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            className="accent-bati-teal cursor-pointer"
                            aria-label="Sélectionner la ligne"
                            checked={checked}
                            onChange={() => selection.toggle(r.deployment.id)}
                          />
                        </td>
                        <td className="py-2 pr-3 text-bati-text font-medium">
                          {r.materiel?.name ?? (
                            <span className="text-bati-muted italic">
                              Matériel supprimé
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {r.materiel ? (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                                r.materiel.type === 'loue'
                                  ? 'bg-bati-teal-soft text-bati-teal'
                                  : 'border border-bati-border text-bati-muted'
                              }`}
                            >
                              {MATERIEL_KIND_LABEL[r.materiel.type]}
                            </span>
                          ) : (
                            <span className="text-bati-muted">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-bati-muted tabular-nums text-xs">
                          {formatDateShort(r.deployment.start_date)} →{' '}
                          {formatDateShort(r.deployment.end_date)}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-bati-text">
                          {r.deployment.qty ?? 1}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-bati-text">
                          {r.days}
                        </td>
                        <td className="py-2 pl-3 text-right tabular-nums font-semibold text-bati-text">
                          {formatMAD(r.cost)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-bati-border">
                    <td />
                    <td
                      colSpan={5}
                      className="py-2 pr-3 text-xs text-bati-muted text-right"
                    >
                      Coût matériel total ({rows.length} déploiement
                      {rows.length > 1 ? 's' : ''})
                    </td>
                    <td className="py-2 pl-3 text-right tabular-nums font-bold text-bati-text">
                      {formatMAD(totalCost)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>

      {editing !== undefined && (
        <DeploymentEditModal
          chantierId={chantierId}
          deployment={editing}
          onClose={() => setEditing(undefined)}
        />
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Supprimer ${selection.selectedCount} déploiement${selection.selectedCount > 1 ? 's' : ''} ?`}
        description={`${selection.selectedCount} déploiement${selection.selectedCount > 1 ? 's seront supprimés' : ' sera supprimé'} et retiré du calcul du coût matériel sur ce chantier.`}
        confirmLabel="Supprimer"
        destructive
        onConfirm={handleBulkDelete}
      />
    </>
  );
}
