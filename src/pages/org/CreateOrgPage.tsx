import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useOrg } from '@/contexts/OrgContext';
import * as orgsDAL from '@/data/orgs';
import { toast } from '@/components/ui/Toast';

export default function CreateOrgPage() {
  const { refresh } = useOrg();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const pending = useQuery({
    queryKey: ['pending-invites'],
    queryFn: () => orgsDAL.listMyPendingInvites(),
  });

  const accept = useMutation({
    mutationFn: (membershipId: string) => orgsDAL.acceptInvite(membershipId),
    onSuccess: async () => {
      await refresh();
      toast.success('Invitation acceptée');
      navigate('/', { replace: true });
    },
    onError: (err) => toast.fromError(err, "Échec de l'acceptation"),
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await orgsDAL.createOrg({ name: name.trim() });
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création');
    } finally {
      setSubmitting(false);
    }
  }

  const hasPending = (pending.data?.length ?? 0) > 0;

  return (
    <div className="min-h-screen flex items-center justify-center bg-bati-bg p-6">
      <div className="w-full max-w-md space-y-4">
        {hasPending && (
          <div className="bati-card rounded-lg p-6">
            <h2 className="text-base font-bold text-bati-teal mb-1">
              Invitations en attente
            </h2>
            <p className="text-xs text-bati-muted mb-4">
              Vous avez été invité à rejoindre {pending.data!.length === 1 ? 'une' : 'plusieurs'} organisation(s).
            </p>
            <ul className="space-y-2">
              {pending.data!.map((inv) => (
                <li
                  key={inv.membership_id}
                  className="flex items-center justify-between gap-3 p-3 border border-bati-border rounded-md"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-bati-text truncate">
                      {inv.org_name}
                    </div>
                    <div className="text-xs text-bati-muted">
                      {orgsDAL.ORG_ROLE_LABEL[inv.role]}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => accept.mutate(inv.membership_id)}
                    disabled={accept.isPending}
                    className="px-3 py-1.5 text-xs bg-bati-teal text-white rounded-md hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
                  >
                    {accept.isPending ? '…' : 'Accepter'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="bati-card rounded-lg p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-bati-teal mb-1">
            {hasPending ? 'Ou créez votre organisation' : 'Bienvenue'}
          </h1>
          <p className="text-sm text-bati-muted mb-6">
            Créez votre organisation pour commencer. Vous en serez le propriétaire et
            pourrez inviter votre équipe plus tard.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label
                className="block text-xs font-medium text-bati-muted mb-1"
                htmlFor="name"
              >
                Nom de l&apos;organisation
              </label>
              <input
                id="name"
                type="text"
                required
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bati-input"
                placeholder="Atlas Construction"
                autoFocus={!hasPending}
              />
            </div>
            {error && (
              <p className="text-xs text-bati-terra" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="w-full bg-bati-teal text-white py-2 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
            >
              {submitting ? 'Création…' : "Créer l'organisation"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
