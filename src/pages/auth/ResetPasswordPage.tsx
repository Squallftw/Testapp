import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export default function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la demande');
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bati-bg p-6">
        <div className="bati-card rounded-lg p-8 w-full max-w-md shadow-sm text-center">
          <h1 className="text-xl font-bold text-bati-teal mb-3">Email envoyé</h1>
          <p className="text-sm text-bati-muted">
            Si un compte existe pour <strong>{email}</strong>, vous recevrez un lien de
            réinitialisation par email.
          </p>
          <Link to="/login" className="block mt-6 text-xs text-bati-teal hover:underline">
            Retour à la connexion
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bati-bg p-6">
      <div className="bati-card rounded-lg p-8 w-full max-w-md shadow-sm">
        <h1 className="text-2xl font-bold text-bati-teal mb-1">Mot de passe oublié</h1>
        <p className="text-sm text-bati-muted mb-6">
          Entrez votre email — nous vous enverrons un lien de réinitialisation.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bati-input"
              autoComplete="email"
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
            disabled={submitting}
            className="w-full bg-bati-teal text-white py-2 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
          >
            {submitting ? 'Envoi…' : 'Envoyer le lien'}
          </button>
        </form>
        <div className="mt-6 text-xs text-center">
          <Link to="/login" className="text-bati-teal hover:underline">
            Retour à la connexion
          </Link>
        </div>
      </div>
    </div>
  );
}
