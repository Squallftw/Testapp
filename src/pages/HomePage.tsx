import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrg } from '@/contexts/OrgContext';

export default function HomePage() {
  const { user, signOut } = useAuth();
  const { activeOrg } = useOrg();
  const [signingOut, setSigningOut] = useState(false);

  async function handleLogout() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-bati-bg flex flex-col">
      <header className="bati-topbar border-b border-bati-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-bati-teal">BatiTrack</h1>
          {activeOrg && (
            <>
              <span className="text-bati-muted">·</span>
              <span className="text-sm text-bati-text">{activeOrg.name}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-bati-muted">{user?.email}</span>
          <button
            onClick={handleLogout}
            disabled={signingOut}
            className="text-bati-terra hover:underline disabled:opacity-50"
            type="button"
          >
            {signingOut ? 'Déconnexion…' : 'Déconnexion'}
          </button>
        </div>
      </header>
      <main className="flex-1 p-6">
        <div className="bati-card rounded-lg p-8 max-w-2xl mx-auto">
          <h2 className="text-xl font-bold text-bati-teal mb-3">Bienvenue dans BatiTrack</h2>
          <p className="text-sm text-bati-muted leading-relaxed mb-4">
            L&apos;authentification et la gestion d&apos;organisation sont en place. Les pages
            métier arrivent ensuite, dans l&apos;ordre :
          </p>
          <ol className="text-sm text-bati-text space-y-1 list-decimal list-inside marker:text-bati-muted">
            <li>Chantiers (création, statut, budget)</li>
            <li>Ouvriers</li>
            <li>Pointage (présence + primes)</li>
            <li>Matériel & affectations</li>
            <li>Fournisseurs</li>
            <li>Consommables (articles / achats / consommation / transferts / ajustements)</li>
            <li>Encaissements clients</li>
            <li>Planning / tâches</li>
            <li>Tableau de bord budgétaire</li>
          </ol>
        </div>
      </main>
    </div>
  );
}
