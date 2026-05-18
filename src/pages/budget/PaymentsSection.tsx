import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listPaymentsForChantier,
  softDeletePayment,
  type ChantierPayment,
} from '@/data/payments';
import { useOrg } from '@/contexts/OrgContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { useBulkSelection } from '@/components/ui/useBulkSelection';
import { formatDateShort, formatMAD } from '@/lib/format';
import { PaymentEditModal } from './PaymentEditModal';

interface PaymentsSectionProps {
  chantierId: string;
  contractValue: number;
}

/**
 * Lists all client payments received for a chantier with create / edit / delete
 * actions. Rendered inside ChantierBudgetView for owner / admin roles only
 * (gated by parent — RLS already enforces server-side).
 */
export function PaymentsSection({ chantierId, contractValue }: PaymentsSectionProps) {
  const { activeOrg } = useOrg();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ChantierPayment | null | undefined>(
    undefined
  );
  const [confirming, setConfirming] = useState(false);

  const paymentsQ = useQuery({
    queryKey: ['payments', chantierId],
    queryFn: () => listPaymentsForChantier(chantierId),
    enabled: !!activeOrg,
  });

  const payments = useMemo(() => paymentsQ.data ?? [], [paymentsQ.data]);
  const selection = useBulkSelection(payments);

  const total = useMemo(
    () => payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0),
    [payments]
  );

  const remaining = contractValue > 0 ? Math.max(0, contractValue - total) : 0;

  async function handleBulkDelete() {
    try {
      const items = selection.selected;
      await Promise.all(items.map((p) => softDeletePayment(p.id)));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['payments', chantierId] }),
        queryClient.invalidateQueries({
          queryKey: ['budget-summary', activeOrg?.id, chantierId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['budget-summaries', activeOrg?.id],
        }),
      ]);
      toast.success(
        `${items.length} paiement${items.length > 1 ? 's' : ''} supprimé${items.length > 1 ? 's' : ''}`
      );
      selection.clear();
    } catch (err) {
      toast.fromError(err, 'Échec de la suppression');
      throw err;
    }
  }

  return (
    <>
      <div className="bati-card rounded-lg p-5">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-bold text-bati-text">
              Paiements reçus du client
            </h3>
            <p className="text-xs text-bati-muted mt-0.5">
              Acomptes, situations, soldes — alimente la position de trésorerie.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="px-3 py-1.5 text-sm bg-bati-teal text-white rounded-md hover:opacity-90 whitespace-nowrap"
          >
            + Enregistrer un paiement
          </button>
        </div>

        {selection.selectedCount > 0 && (
          <div className="mb-3 rounded-md border border-bati-teal/40 bg-bati-teal-soft/30 px-3 py-2 flex items-center justify-between gap-3">
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

        {paymentsQ.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : paymentsQ.isError ? (
          <p className="text-sm text-bati-terra py-3">
            {paymentsQ.error instanceof Error
              ? paymentsQ.error.message
              : 'Erreur de chargement'}
          </p>
        ) : payments.length === 0 ? (
          <EmptyState
            title="Aucun paiement enregistré"
            description="Les paiements reçus du client apparaîtront ici et alimenteront la position de trésorerie."
          />
        ) : (
          <>
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
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 px-3 font-medium">Référence</th>
                    <th className="py-2 px-3 font-medium text-right">Montant</th>
                    <th className="py-2 pl-3 font-medium text-right w-20">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bati-border-soft">
                  {payments.map((p) => {
                    const checked = selection.isSelected(p.id);
                    return (
                      <tr
                        key={p.id}
                        className={
                          checked
                            ? 'bg-bati-teal-soft/30'
                            : 'hover:bg-bati-border-soft/40'
                        }
                      >
                        <td className="py-2 pr-2">
                          <input
                            type="checkbox"
                            className="accent-bati-teal cursor-pointer"
                            aria-label="Sélectionner la ligne"
                            checked={checked}
                            onChange={() => selection.toggle(p.id)}
                          />
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-bati-text">
                          {formatDateShort(p.payment_date)}
                        </td>
                        <td className="py-2 px-3 text-bati-text">
                          {p.reference || (
                            <span className="text-bati-muted italic">—</span>
                          )}
                          {p.notes && (
                            <div className="text-xs text-bati-muted mt-0.5 truncate max-w-[20rem]">
                              {p.notes}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold text-bati-success">
                          +{formatMAD(p.amount)}
                        </td>
                        <td className="py-2 pl-3 text-right">
                          <button
                            type="button"
                            onClick={() => setEditing(p)}
                            className="text-xs text-bati-teal hover:underline"
                          >
                            Modifier
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-bati-border">
                    <td />
                    <td colSpan={2} className="py-2 pr-3 text-xs text-bati-muted">
                      Total reçu ({payments.length} paiement
                      {payments.length > 1 ? 's' : ''})
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums font-bold text-bati-text">
                      {formatMAD(total)}
                    </td>
                    <td />
                  </tr>
                  {contractValue > 0 && (
                    <tr>
                      <td />
                      <td colSpan={2} className="py-1 pr-3 text-xs text-bati-muted">
                        Reste à facturer sur le contrat
                      </td>
                      <td className="py-1 px-3 text-right tabular-nums text-bati-muted">
                        {formatMAD(remaining)}
                      </td>
                      <td />
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>

      {editing !== undefined && (
        <PaymentEditModal
          chantierId={chantierId}
          payment={editing}
          onClose={() => setEditing(undefined)}
        />
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Supprimer ${selection.selectedCount} paiement${selection.selectedCount > 1 ? 's' : ''} ?`}
        description={`${selection.selectedCount} paiement${selection.selectedCount > 1 ? 's seront supprimés' : ' sera supprimé'} et retiré du calcul de la position de trésorerie.`}
        confirmLabel="Supprimer"
        destructive
        onConfirm={handleBulkDelete}
      />
    </>
  );
}
