import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/Button';

export default function SignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await signUp(email.trim(), password);
      if (result.emailConfirmationRequired) {
        setConfirmationSent(true);
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'inscription");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmationSent) {
    return (
      <AuthLayout>
        <div className="bati-card bati-elev-1 rounded-xl p-8 text-center">
          <h1 className="text-xl font-bold text-bati-teal mb-3">Vérifiez votre email</h1>
          <p className="text-sm text-bati-muted">
            Nous avons envoyé un lien de confirmation à <strong>{email}</strong>. Cliquez
            dessus pour activer votre compte.
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
        <h1 className="text-2xl font-bold text-bati-text mb-1">Créer un compte</h1>
        <p className="text-sm text-bati-muted mb-6">
          Commencez à suivre vos chantiers en quelques minutes.
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
          <div>
            <label
              className="block text-xs font-medium text-bati-muted mb-1"
              htmlFor="password"
            >
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bati-input"
              autoComplete="new-password"
              aria-describedby="password-hint"
            />
            <p id="password-hint" className="text-[11px] text-bati-muted mt-1">
              8 caractères minimum.
            </p>
          </div>
          {error && (
            <p className="text-xs text-bati-terra" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" loading={submitting} className="w-full">
            {submitting ? 'Création…' : 'Créer le compte'}
          </Button>
        </form>
        <div className="mt-6 text-xs text-center">
          <Link to="/login" className="text-bati-teal hover:underline">
            J&apos;ai déjà un compte
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
