import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  listPaymentsForChantier,
  type ChantierPayment,
} from '@/data/payments';
import { useOrg } from '@/contexts/OrgContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
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
  const [editing, setEditing] = useState<ChantierPayment | null | undefined>(
    undefined
  );

  const paymentsQ = useQuery({
    queryKey: ['payments', chantierId],
    queryFn: () => listPaymentsForChantier(chantierId),
    enabled: !!activeOrg,
  });

  const total = useMemo(
    () =>
      (paymentsQ.data ?? []).reduce(
        (acc, p) => acc + (Number(p.amount) || 0),
        0
      ),
    [paymentsQ.data]
  );

  const remaining = contractValue > 0 ? Math.max(0, contractValue - total) : 0;

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
        ) : (paymentsQ.data ?? []).length === 0 ? (
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
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 px-3 font-medium">Référence</th>
                    <th className="py-2 px-3 font-medium text-right">Montant</th>
                    <th className="py-2 pl-3 font-medium text-right w-20">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bati-border-soft">
                  {(paymentsQ.data ?? []).map((p) => (
                    <tr key={p.id} className="hover:bg-bati-border-soft/40">
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
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-bati-border">
                    <td colSpan={2} className="py-2 pr-3 text-xs text-bati-muted">
                      Total reçu ({(paymentsQ.data ?? []).length} paiement
                      {(paymentsQ.data ?? []).length > 1 ? 's' : ''})
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums font-bold text-bati-text">
                      {formatMAD(total)}
                    </td>
                    <td />
                  </tr>
                  {contractValue > 0 && (
                    <tr>
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
    </>
  );
}
