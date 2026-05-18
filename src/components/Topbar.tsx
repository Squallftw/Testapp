import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrg } from '@/contexts/OrgContext';
import { toast } from '@/components/ui/Toast';

interface TopbarProps {
  onOpenSidebar: () => void;
}

function roleLabel(role: 'owner' | 'admin' | 'site_manager' | 'worker' | null): string {
  switch (role) {
    case 'owner':
      return 'Propriétaire';
    case 'admin':
      return 'Administrateur';
    case 'site_manager':
      return 'Chef de chantier';
    case 'worker':
      return 'Ouvrier';
    default:
      return '';
  }
}

export function Topbar({ onOpenSidebar }: TopbarProps) {
  const { user, signOut } = useAuth();
  const { activeOrg, myRole } = useOrg();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } catch (err) {
      toast.fromError(err, 'Échec de la déconnexion');
    } finally {
      setSigningOut(false);
      setMenuOpen(false);
    }
  }

  return (
    <header className="bati-topbar border-b px-4 md:px-6 h-14 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="md:hidden p-1.5 -ml-1 rounded-md text-bati-muted hover:text-bati-text hover:bg-bati-border-soft"
          aria-label="Ouvrir le menu"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        {activeOrg && (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-bati-text truncate">
              {activeOrg.name}
            </span>
          </div>
        )}
      </div>

      <div className="relative flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-bati-border-soft text-sm"
        >
          <div className="w-7 h-7 rounded-full bg-bati-teal-soft text-bati-teal flex items-center justify-center text-xs font-semibold">
            {user?.email?.[0]?.toUpperCase() ?? '?'}
          </div>
          <span className="hidden sm:inline text-bati-text truncate max-w-[180px]">
            {user?.email}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="text-bati-muted"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {menuOpen && (
          <>
            <button
              type="button"
              aria-label="Fermer le menu"
              className="fixed inset-0 z-30"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute right-0 top-full mt-1 w-64 bati-card rounded-lg shadow-lg p-3 z-40">
              <div className="px-2 pb-2 border-b border-bati-border-soft">
                <div className="text-xs text-bati-muted">Connecté en tant que</div>
                <div className="text-sm font-medium text-bati-text truncate">
                  {user?.email}
                </div>
                {myRole && (
                  <div className="text-xs text-bati-muted mt-0.5">
                    {roleLabel(myRole)}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="mt-2 w-full text-left px-2 py-1.5 text-sm text-bati-terra hover:bg-bati-terra-soft rounded-md transition-colors disabled:opacity-50"
              >
                {signingOut ? 'Déconnexion…' : 'Se déconnecter'}
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
