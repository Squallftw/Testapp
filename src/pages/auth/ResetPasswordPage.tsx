import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/Button';

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
      <AuthLayout>
        <div className="bati-card bati-elev-1 rounded-xl p-8 text-center">
          <h1 className="text-xl font-bold text-bati-teal mb-3">Email envoyé</h1>
          <p className="text-sm text-bati-muted">
            Si un compte existe pour <strong>{email}</strong>, vous recevrez un lien de
            réinitialisation par email.
          </p>
          <Link to="/login" className="block mt-6 text-xs text-bati-teal hover:underline">
            Retour à la connexion
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="bati-card bati-elev-1 rounded-xl p-8">
        <h1 className="text-2xl font-bold text-bati-text mb-1">Mot de passe oublié</h1>
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
          <Button type="submit" loading={submitting} className="w-full">
            {submitting ? 'Envoi…' : 'Envoyer le lien'}
          </Button>
        </form>
        <div className="mt-6 text-xs text-center">
          <Link to="/login" className="text-bati-teal hover:underline">
            Retour à la connexion
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
