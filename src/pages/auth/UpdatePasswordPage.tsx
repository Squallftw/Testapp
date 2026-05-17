import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export default function UpdatePasswordPage() {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setSubmitting(true);
    try {
      await updatePassword(password);
      setDone(true);
      setTimeout(() => navigate('/', { replace: true }), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bati-bg p-6">
        <div className="bati-card rounded-lg p-8 w-full max-w-md shadow-sm text-center">
          <h1 className="text-xl font-bold text-bati-success mb-3">
            Mot de passe mis à jour
          </h1>
          <p className="text-sm text-bati-muted">Redirection en cours…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bati-bg p-6">
      <div className="bati-card rounded-lg p-8 w-full max-w-md shadow-sm">
        <h1 className="text-2xl font-bold text-bati-teal mb-1">
          Nouveau mot de passe
        </h1>
        <p className="text-sm text-bati-muted mb-6">
          Définissez un nouveau mot de passe pour votre compte.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label
              className="block text-xs font-medium text-bati-muted mb-1"
              htmlFor="password"
            >
              Nouveau mot de passe
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bati-input"
              autoComplete="new-password"
              autoFocus
            />
            <p className="text-xs text-bati-muted mt-1">8 caractères minimum.</p>
          </div>
          <div>
            <label
              className="block text-xs font-medium text-bati-muted mb-1"
              htmlFor="confirm"
            >
              Confirmer le mot de passe
            </label>
            <input
              id="confirm"
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="bati-input"
              autoComplete="new-password"
            />
          </div>
          {error && (
            <p className="text-xs text-bati-terra" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-bati-teal text-white py-2 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
          >
            {submitting ? 'Mise à jour…' : 'Mettre à jour'}
          </button>
        </form>
        <div className="mt-6 text-xs text-center">
          <Link to="/" className="text-bati-teal hover:underline">
            Annuler
          </Link>
        </div>
      </div>
    </div>
  );
}
