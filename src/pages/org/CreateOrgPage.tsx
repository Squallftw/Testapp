import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/contexts/OrgContext';
import * as orgsDAL from '@/data/orgs';

export default function CreateOrgPage() {
  const { refresh } = useOrg();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await orgsDAL.createOrg({ name: name.trim() });
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la création");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bati-bg p-6">
      <div className="bati-card rounded-lg p-8 w-full max-w-md shadow-sm">
        <h1 className="text-2xl font-bold text-bati-teal mb-1">Bienvenue</h1>
        <p className="text-sm text-bati-muted mb-6">
          Créez votre organisation pour commencer. Vous en serez le propriétaire et pourrez
          inviter votre équipe plus tard.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1" htmlFor="name">
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
              autoFocus
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
  );
}
