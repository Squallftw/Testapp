import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import {
  createSupplier,
  listSuppliers,
  softDeleteSupplier,
  updateSupplier,
  type Supplier,
} from '@/data/suppliers';
import { useOrg } from '@/contexts/OrgContext';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';

const SupplierSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est requis'),
  type: z.string().trim(),
  phone: z.string().trim(),
  city: z.string().trim(),
  address: z.string().trim(),
  notes: z.string().trim(),
});
type SupplierForm = z.input<typeof SupplierSchema>;

const columnHelper = createColumnHelper<Supplier>();

export default function SuppliersPage() {
  const { activeOrg } = useOrg();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Supplier | null>(null);

  const query = useQuery({
    queryKey: ['suppliers', activeOrg?.id],
    queryFn: () => listSuppliers(),
    enabled: !!activeOrg,
  });

  const remove = useMutation({
    mutationFn: (id: string) => softDeleteSupplier(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Fournisseur archivé');
    },
    onError: (err) => toast.fromError(err, 'Échec de la suppression'),
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Nom',
        cell: (info) => (
          <button
            type="button"
            onClick={() => setEditing(info.row.original)}
            className="font-medium text-bati-text hover:text-bati-teal hover:underline"
          >
            {info.getValue()}
          </button>
        ),
      }),
      columnHelper.accessor('type', {
        header: 'Type',
        cell: (info) => info.getValue() ?? <span className="text-bati-muted">—</span>,
      }),
      columnHelper.accessor('phone', {
        header: 'Téléphone',
        cell: (info) => info.getValue() ?? <span className="text-bati-muted">—</span>,
      }),
      columnHelper.accessor('city', {
        header: 'Ville',
        cell: (info) => info.getValue() ?? <span className="text-bati-muted">—</span>,
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: (info) => (
          <button
            type="button"
            onClick={() => setConfirmDelete(info.row.original)}
            className="text-xs text-bati-terra hover:underline"
          >
            Archiver
          </button>
        ),
      }),
    ],
    []
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium hover:opacity-90"
        >
          Nouveau fournisseur
        </button>
      </div>

      <DataTable
        data={query.data ?? []}
        columns={columns}
        isLoading={query.isLoading}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Rechercher un fournisseur…"
        bulkDelete={{
          confirmTitle: (n) => `Archiver ${n} fournisseur${n > 1 ? 's' : ''} ?`,
          confirmDescription: (n) =>
            `${n} fournisseur${n > 1 ? 's' : ''} n'apparaîtront plus dans les listes.`,
          successMessage: (n) => `${n} fournisseur${n > 1 ? 's' : ''} archivé${n > 1 ? 's' : ''}`,
          onConfirm: async (selected) => {
            await Promise.all(selected.map((s) => softDeleteSupplier(s.id)));
            await queryClient.invalidateQueries({ queryKey: ['suppliers'] });
          },
        }}
        empty={
          <EmptyState
            title="Aucun fournisseur"
            description="Ajoutez vos fournisseurs pour suivre achats et coûts."
            action={
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium"
              >
                Ajouter un fournisseur
              </button>
            }
          />
        }
      />

      {creating && <SupplierModal mode="create" onClose={() => setCreating(false)} />}
      {editing && (
        <SupplierModal mode="edit" supplier={editing} onClose={() => setEditing(null)} />
      )}
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Archiver ce fournisseur ?"
        description={
          confirmDelete && (
            <>
              <strong>{confirmDelete.name}</strong> n&apos;apparaîtra plus dans les
              listes.
            </>
          )
        }
        confirmLabel="Archiver"
        destructive
        onConfirm={async () => {
          if (confirmDelete) await remove.mutateAsync(confirmDelete.id);
        }}
      />
    </div>
  );
}

function SupplierModal({
  mode,
  supplier,
  onClose,
}: {
  mode: 'create' | 'edit';
  supplier?: Supplier;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<SupplierForm>({
    resolver: zodResolver(SupplierSchema),
    defaultValues: {
      name: supplier?.name ?? '',
      type: supplier?.type ?? '',
      phone: supplier?.phone ?? '',
      city: supplier?.city ?? '',
      address: supplier?.address ?? '',
      notes: supplier?.notes ?? '',
    },
  });

  const save = useMutation({
    mutationFn: (v: z.output<typeof SupplierSchema>) => {
      const payload = {
        name: v.name,
        type: v.type || null,
        phone: v.phone || null,
        city: v.city || null,
        address: v.address || null,
        notes: v.notes || null,
      };
      if (mode === 'create') return createSupplier(payload);
      return updateSupplier(supplier!.id, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success(mode === 'create' ? 'Fournisseur ajouté' : 'Fournisseur mis à jour');
      onClose();
    },
    onError: (err) => toast.fromError(err, "Échec de l'enregistrement"),
  });

  const onSubmit = form.handleSubmit((v) => save.mutate(SupplierSchema.parse(v)));

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={mode === 'create' ? 'Nouveau fournisseur' : 'Modifier le fournisseur'}
      size="lg"
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label className="block text-xs font-medium text-bati-muted mb-1">
            Nom <span className="text-bati-terra">*</span>
          </label>
          <input type="text" className="bati-input" {...form.register('name')} autoFocus />
          {form.formState.errors.name && (
            <p className="text-xs text-bati-terra mt-1" role="alert">
              {form.formState.errors.name.message}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Type
            </label>
            <input
              type="text"
              className="bati-input"
              {...form.register('type')}
              placeholder="Ex : ciment, fer, peinture"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Téléphone
            </label>
            <input type="tel" className="bati-input" {...form.register('phone')} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Ville
            </label>
            <input type="text" className="bati-input" {...form.register('city')} />
          </div>
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Adresse
            </label>
            <input type="text" className="bati-input" {...form.register('address')} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-bati-muted mb-1">
            Notes
          </label>
          <textarea className="bati-input" rows={2} {...form.register('notes')} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-bati-text hover:bg-bati-border-soft rounded-md"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={save.isPending}
            className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {save.isPending ? 'Enregistrement…' : mode === 'create' ? 'Ajouter' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
