import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface LocationState {
  from?: { pathname: string };
}

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as LocationState | null)?.from?.pathname ?? '/';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bati-bg p-6">
      <div className="bati-card rounded-lg p-8 w-full max-w-md shadow-sm">
        <h1 className="text-2xl font-bold text-bati-teal mb-1">BatiTrack</h1>
        <p className="text-sm text-bati-muted mb-6">Connexion à votre compte.</p>
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
              autoComplete="current-password"
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
            {submitting ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
        <div className="mt-6 flex justify-between text-xs">
          <Link to="/signup" className="text-bati-teal hover:underline">
            Créer un compte
          </Link>
          <Link to="/reset-password" className="text-bati-muted hover:underline">
            Mot de passe oublié ?
          </Link>
        </div>
      </div>
    </div>
  );
}
