import { NavLink } from 'react-router-dom';
import { useOrg } from '@/contexts/OrgContext';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  /** If set, only show when current role is in this list. */
  roles?: Array<'owner' | 'admin' | 'site_manager' | 'worker'>;
}

interface NavSection {
  /** Section heading, or null for the unlabeled top group. */
  label: string | null;
  items: NavItem[];
}

/* Project-first nav: everything that happens ON a site (pointage, planning,
   matériaux, budget…) lives inside its chantier page — the "Chantiers" entry
   is the single door. Org-wide registries sit under "Organisation". */
const SECTIONS: NavSection[] = [
  {
    label: null,
    items: [
      {
        to: '/',
        label: 'Tableau de bord',
        icon: (
          <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
        ),
      },
      {
        to: '/chantiers',
        label: 'Chantiers',
        icon: <path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-7h6v7" />,
      },
    ],
  },
  {
    label: 'Organisation',
    items: [
      {
        to: '/consommables',
        label: 'Matériaux',
        icon: (
          <>
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </>
        ),
      },
      {
        to: '/materiels',
        label: 'Matériels',
        icon: (
          <>
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
          </>
        ),
      },
      {
        to: '/ouvriers',
        label: 'Ouvriers',
        icon: (
          <>
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87" />
            <path d="M16 3.13a4 4 0 010 7.75" />
          </>
        ),
        roles: ['owner', 'admin'],
      },
    ],
  },
  {
    label: 'Paramètres',
    items: [
      {
        to: '/settings/org',
        label: 'Organisation',
        icon: (
          <>
            <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" />
          </>
        ),
        roles: ['owner', 'admin'],
      },
      {
        to: '/settings/members',
        label: 'Membres',
        icon: (
          <>
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
          </>
        ),
        roles: ['owner', 'admin'],
      },
    ],
  },
];

function navIcon(children: React.ReactNode) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const { myRole } = useOrg();

  const visible = (item: NavItem) =>
    !item.roles || (myRole && item.roles.includes(myRole));

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bati-nav-active'
        : 'text-bati-muted hover:bg-bati-border-soft hover:text-bati-text'
    }`;

  return (
    <aside className="bati-sidebar w-64 h-full flex flex-col border-r">
      <div className="px-4 py-4 flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl text-white font-extrabold text-lg flex items-center justify-center shadow-sm shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--bati-primary), var(--bati-accent))' }}
          aria-hidden
        >
          B
        </div>
        <div className="min-w-0">
          <h1 className="text-[15px] font-bold leading-tight text-bati-text">BatiTrack</h1>
          <p className="text-xs text-bati-muted leading-tight">Suivi de chantiers</p>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {SECTIONS.map((section) => {
          const items = section.items.filter(visible);
          if (items.length === 0) return null;
          return (
            <div key={section.label ?? 'main'}>
              {section.label && (
                <div className="mt-6 mb-2 px-3 text-xs uppercase tracking-wide text-bati-muted">
                  {section.label}
                </div>
              )}
              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={linkClass}
                    onClick={onNavigate}
                  >
                    {navIcon(item.icon)}
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
