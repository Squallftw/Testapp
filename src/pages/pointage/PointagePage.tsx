import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listChantiers } from '@/data/chantiers';
import { useChantier } from '@/contexts/ChantierContext';
import { useOrg } from '@/contexts/OrgContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { PointageView } from './PointageView';

export default function PointagePage() {
  const { activeOrg } = useOrg();
  const { activeChantierId, setActiveChantier } = useChantier();

  const chantiers = useQuery({
    queryKey: ['chantiers', activeOrg?.id],
    queryFn: () => listChantiers(),
    enabled: !!activeOrg,
  });

  if (chantiers.isLoading) {
    return <div className="text-sm text-bati-muted">Chargement…</div>;
  }

  if ((chantiers.data?.length ?? 0) === 0) {
    return (
      <EmptyState
        title="Aucun chantier"
        description="Créez d'abord un chantier pour commencer à enregistrer le pointage."
        action={
          <Link
            to="/chantiers/new"
            className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium"
          >
            Créer un chantier
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-bati-text">Pointage</h1>
        <p className="text-sm text-bati-muted mt-0.5">
          Présence quotidienne par chantier, primes et absences.
        </p>
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wide text-bati-muted mb-1">
          Chantier
        </label>
        <select
          value={activeChantierId ?? ''}
          onChange={(e) => setActiveChantier(e.target.value || null)}
          className="bati-input min-w-[260px]"
          aria-label="Chantier"
        >
          <option value="">— Choisir un chantier —</option>
          {(chantiers.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {!activeChantierId ? (
        <EmptyState
          title="Choisissez un chantier"
          description="Sélectionnez un chantier pour afficher la grille de pointage."
        />
      ) : (
        <PointageView chantierId={activeChantierId} />
      )}
    </div>
  );
}
