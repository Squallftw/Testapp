import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createPayment,
  softDeletePayment,
  updatePayment,
  type ChantierPayment,
} from '@/data/payments';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { useOrg } from '@/contexts/OrgContext';
import { format } from 'date-fns';

const PaymentSchema = z.object({
  payment_date: z.string().trim().min(1, 'Date requise'),
  amount: z.coerce.number().positive('Montant doit être > 0'),
  reference: z.string().trim(),
  notes: z.string().trim(),
});
type PaymentForm = z.input<typeof PaymentSchema>;

export interface PaymentEditModalProps {
  chantierId: string;
  /** When editing, the existing payment. When creating, omit. */
  payment: ChantierPayment | null;
  onClose: () => void;
}

export function PaymentEditModal({
  chantierId,
  payment,
  onClose,
}: PaymentEditModalProps) {
  const queryClient = useQueryClient();
  const { activeOrg } = useOrg();
  const isEdit = payment !== null;
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const defaultValues: PaymentForm = useMemo(
    () => ({
      payment_date: payment?.payment_date ?? format(new Date(), 'yyyy-MM-dd'),
      amount: payment?.amount ?? 0,
      reference: payment?.reference ?? '',
      notes: payment?.notes ?? '',
    }),
    [payment]
  );

  const form = useForm<PaymentForm>({
    resolver: zodResolver(PaymentSchema),
    defaultValues,
  });

  async function invalidateAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['payments', chantierId] }),
      queryClient.invalidateQueries({
        queryKey: ['budget-summary', activeOrg?.id, chantierId],
      }),
      queryClient.invalidateQueries({ queryKey: ['budget-summaries', activeOrg?.id] }),
    ]);
  }

  const save = useMutation({
    mutationFn: async (v: z.output<typeof PaymentSchema>) => {
      const payload = {
        payment_date: v.payment_date,
        amount: v.amount,
        reference: v.reference || null,
        notes: v.notes || null,
        attachment_url: null,
      };
      if (isEdit && payment) {
        await updatePayment(payment.id, payload);
      } else {
        await createPayment({ chantier_id: chantierId, ...payload });
      }
    },
    onSuccess: async () => {
      await invalidateAll();
      toast.success(isEdit ? 'Paiement mis à jour' : 'Paiement enregistré');
      onClose();
    },
    onError: (err) => toast.fromError(err, "Échec de l'enregistrement"),
  });

  const remove = useMutation({
    mutationFn: () => (payment ? softDeletePayment(payment.id) : Promise.resolve()),
    onSuccess: async () => {
      await invalidateAll();
      toast.success('Paiement supprimé');
      onClose();
    },
    onError: (err) => toast.fromError(err, 'Échec de la suppression'),
  });

  const onSubmit = form.handleSubmit((v) => save.mutate(PaymentSchema.parse(v)));

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={isEdit ? 'Modifier le paiement' : 'Enregistrer un paiement client'}
      size="md"
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Date <span className="text-bati-terra">*</span>
            </label>
            <input
              type="date"
              className="bati-input"
              autoFocus
              {...form.register('payment_date')}
            />
            {form.formState.errors.payment_date && (
              <p className="text-xs text-bati-terra mt-1" role="alert">
                {form.formState.errors.payment_date.message}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Montant (MAD) <span className="text-bati-terra">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="bati-input"
              placeholder="0.00"
              {...form.register('amount')}
            />
            {form.formState.errors.amount && (
              <p className="text-xs text-bati-terra mt-1" role="alert">
                {form.formState.errors.amount.message}
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-bati-muted mb-1">
            Référence
          </label>
          <input
            type="text"
            className="bati-input"
            placeholder="ex. Virement BMCE 23/04, Acompte 2"
            {...form.register('reference')}
          />
          <p className="text-[10px] text-bati-muted mt-1">
            Numéro de virement, chèque, ou libellé d&apos;échéance.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-bati-muted mb-1">
            Notes
          </label>
          <textarea
            rows={2}
            className="bati-input"
            placeholder="Remarques internes (optionnel)"
            {...form.register('notes')}
          />
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-bati-border">
          <div>
            {isEdit && (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={save.isPending || remove.isPending}
                className="px-3 py-2 text-sm text-bati-terra hover:bg-bati-terra-soft rounded-md transition-colors disabled:opacity-50"
              >
                Supprimer
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={save.isPending || remove.isPending}
              className="px-4 py-2 text-sm text-bati-text hover:bg-bati-border-soft rounded-md transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={save.isPending || remove.isPending}
              className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={(o) => !o && setConfirmingDelete(false)}
        title="Supprimer ce paiement ?"
        description="Le paiement sera archivé (soft-delete) et retiré du calcul de la position de trésorerie."
        confirmLabel="Supprimer"
        destructive
        onConfirm={async () => {
          await remove.mutateAsync();
        }}
      />
    </Modal>
  );
}
