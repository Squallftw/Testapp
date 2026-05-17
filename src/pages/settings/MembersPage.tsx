import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import {
  ORG_ROLE_LABEL,
  MEMBER_STATUS_LABEL,
  inviteMember,
  listMembers,
  revokeMember,
  updateMemberRole,
  type MemberDetail,
  type OrgRole,
} from '@/data/orgs';
import { listChantiers } from '@/data/chantiers';
import { useOrg } from '@/contexts/OrgContext';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { formatDateShort } from '@/lib/format';

const columnHelper = createColumnHelper<MemberDetail>();

const InviteSchema = z.object({
  email: z.string().trim().email('Adresse email invalide'),
  role: z.enum(['owner', 'admin', 'site_manager', 'worker']),
  chantierIds: z.array(z.string().uuid()).optional(),
});

type InviteValues = z.input<typeof InviteSchema>;

export default function MembersPage() {
  const { activeOrg, myRole } = useOrg();
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<MemberDetail | null>(null);

  const isOwner = myRole === 'owner';

  const members = useQuery({
    queryKey: ['members', activeOrg?.id],
    queryFn: () => listMembers(activeOrg!.id),
    enabled: !!activeOrg,
  });

  const chantiers = useQuery({
    queryKey: ['chantiers', activeOrg?.id],
    queryFn: () => listChantiers(),
    enabled: !!activeOrg,
  });

  const roleUpdate = useMutation({
    mutationFn: ({ id, role }: { id: string; role: OrgRole }) =>
      updateMemberRole(id, role),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      toast.success('Rôle mis à jour');
    },
    onError: (err) => toast.fromError(err, 'Échec de la mise à jour du rôle'),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeMember(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      toast.success('Membre révoqué');
    },
    onError: (err) => toast.fromError(err, 'Échec de la révocation'),
  });

  const invite = useMutation({
    mutationFn: (values: z.output<typeof InviteSchema>) =>
      inviteMember(activeOrg!.id, {
        email: values.email,
        role: values.role,
        chantierIds: values.chantierIds,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      toast.success('Invitation envoyée');
      setInviteOpen(false);
    },
    onError: (err) => toast.fromError(err, "Échec de l'invitation"),
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor('email', {
        header: 'Email',
        cell: (info) => (
          <span className="font-medium text-bati-text">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor('role', {
        header: 'Rôle',
        cell: (info) => {
          const m = info.row.original;
          const canEdit =
            myRole === 'owner' || (myRole === 'admin' && m.role !== 'owner');
          if (!canEdit) {
            return (
              <span className="text-bati-muted">{ORG_ROLE_LABEL[info.getValue()]}</span>
            );
          }
          return (
            <select
              value={info.getValue()}
              onChange={(e) =>
                roleUpdate.mutate({
                  id: m.membership_id,
                  role: e.target.value as OrgRole,
                })
              }
              className="bati-input py-1"
              disabled={roleUpdate.isPending}
            >
              {(['owner', 'admin', 'site_manager', 'worker'] as const).map((r) => (
                <option key={r} value={r} disabled={r === 'owner' && !isOwner}>
                  {ORG_ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          );
        },
      }),
      columnHelper.accessor('status', {
        header: 'Statut',
        cell: (info) => {
          const s = info.getValue();
          const cls =
            s === 'active'
              ? 'text-bati-success'
              : s === 'invited'
                ? 'text-bati-ochre'
                : 'text-bati-muted';
          return (
            <span className={`text-xs font-medium ${cls}`}>
              {MEMBER_STATUS_LABEL[s]}
            </span>
          );
        },
      }),
      columnHelper.accessor('invited_at', {
        header: 'Invité le',
        cell: (info) => (
          <span className="text-bati-muted text-xs">
            {formatDateShort(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor('accepted_at', {
        header: 'Accepté le',
        cell: (info) => (
          <span className="text-bati-muted text-xs">
            {formatDateShort(info.getValue())}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: (info) => {
          const m = info.row.original;
          const canRevoke =
            myRole === 'owner' || (myRole === 'admin' && m.role !== 'owner');
          if (!canRevoke) return null;
          return (
            <button
              type="button"
              onClick={() => setConfirmRevoke(m)}
              className="text-xs text-bati-terra hover:underline"
            >
              Révoquer
            </button>
          );
        },
      }),
    ],
    [isOwner, myRole, roleUpdate]
  );

  if (members.isError) {
    return (
      <EmptyState
        title="Erreur"
        description={
          members.error instanceof Error ? members.error.message : 'Erreur inconnue.'
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-bati-text">Membres</h1>
          <p className="text-sm text-bati-muted mt-0.5">
            {members.data
              ? `${members.data.length} membre(s)`
              : 'Chargement…'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium hover:opacity-90"
        >
          Inviter un membre
        </button>
      </div>

      <DataTable
        data={members.data ?? []}
        columns={columns}
        isLoading={members.isLoading}
        empty={
          <EmptyState
            title="Aucun membre"
            description="Invitez votre équipe pour collaborer sur les chantiers."
          />
        }
      />

      <InviteModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        chantiers={chantiers.data ?? []}
        onSubmit={(values) => invite.mutate(values)}
        isPending={invite.isPending}
      />

      <ConfirmDialog
        open={!!confirmRevoke}
        onOpenChange={(open) => !open && setConfirmRevoke(null)}
        title="Révoquer ce membre ?"
        description={
          confirmRevoke && (
            <>
              <strong>{confirmRevoke.email}</strong> perdra immédiatement l&apos;accès
              à l&apos;organisation. Vous pourrez le réinviter plus tard.
            </>
          )
        }
        confirmLabel="Révoquer"
        destructive
        onConfirm={async () => {
          if (confirmRevoke) await revoke.mutateAsync(confirmRevoke.membership_id);
        }}
      />
    </div>
  );
}

interface InviteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chantiers: Array<{ id: string; name: string }>;
  onSubmit: (values: z.output<typeof InviteSchema>) => void;
  isPending: boolean;
}

function InviteModal({
  open,
  onOpenChange,
  chantiers,
  onSubmit,
  isPending,
}: InviteModalProps) {
  const form = useForm<InviteValues>({
    resolver: zodResolver(InviteSchema),
    defaultValues: { email: '', role: 'site_manager', chantierIds: [] },
  });
  const role = form.watch('role');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void form.handleSubmit((v) => {
      const parsed = InviteSchema.parse(v);
      onSubmit(parsed);
      form.reset();
    })(e);
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) form.reset();
        onOpenChange(o);
      }}
      title="Inviter un membre"
      description="L'invité doit avoir déjà créé un compte BatiTrack avec cet email."
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label className="block text-xs font-medium text-bati-muted mb-1">
            Email <span className="text-bati-terra">*</span>
          </label>
          <input
            type="email"
            className="bati-input"
            {...form.register('email')}
            autoFocus
          />
          {form.formState.errors.email && (
            <p className="text-xs text-bati-terra mt-1" role="alert">
              {form.formState.errors.email.message}
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-bati-muted mb-1">
            Rôle
          </label>
          <select className="bati-input" {...form.register('role')}>
            <option value="admin">Administrateur</option>
            <option value="site_manager">Chef de chantier</option>
            <option value="worker">Ouvrier</option>
            <option value="owner">Propriétaire</option>
          </select>
        </div>

        {role === 'site_manager' && chantiers.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Chantiers assignés
            </label>
            <p className="text-xs text-bati-muted mb-2">
              Sélectionnez les chantiers auxquels ce chef de chantier aura accès.
            </p>
            <div className="space-y-1 max-h-40 overflow-y-auto bati-input p-2">
              {chantiers.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 text-sm cursor-pointer hover:bg-bati-border-soft rounded px-1 py-0.5"
                >
                  <input
                    type="checkbox"
                    value={c.id}
                    {...form.register('chantierIds')}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 text-sm text-bati-text hover:bg-bati-border-soft rounded-md"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? 'Envoi…' : 'Inviter'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
