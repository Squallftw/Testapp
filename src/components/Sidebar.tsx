import { NavLink } from 'react-router-dom';
import { useOrg } from '@/contexts/OrgContext';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  /** If set, only show when current role is in this list. */
  roles?: Array<'owner' | 'admin' | 'site_manager' | 'worker'>;
}

const NAV: NavItem[] = [
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
  {
    to: '/pointage',
    label: 'Pointage',
    icon: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </>
    ),
  },
  {
    to: '/planning',
    label: 'Planning',
    icon: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="8" y1="3" x2="8" y2="9" />
        <rect x="6" y="11" width="6" height="2" />
        <rect x="10" y="15" width="8" height="2" />
      </>
    ),
  },
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
];

const SETTINGS_NAV: NavItem[] = [
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
    `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
      isActive
        ? 'bati-nav-active'
        : 'text-bati-text hover:bg-bati-border-soft'
    }`;

  return (
    <aside className="bati-sidebar w-64 h-full flex flex-col border-r">
      <div className="px-5 py-4 border-b border-bati-border">
        <h1 className="text-lg font-bold text-bati-teal">BatiTrack</h1>
        <p className="text-xs text-bati-muted mt-0.5">Suivi de chantiers</p>
      </div>
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <div className="space-y-0.5">
          {NAV.filter(visible).map((item) => (
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
        {SETTINGS_NAV.some(visible) && (
          <>
            <div className="mt-6 mb-2 px-3 text-xs uppercase tracking-wide text-bati-muted">
              Paramètres
            </div>
            <div className="space-y-0.5">
              {SETTINGS_NAV.filter(visible).map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={linkClass}
                  onClick={onNavigate}
                >
                  {navIcon(item.icon)}
                  {item.label}
                </NavLink>
              ))}
            </div>
          </>
        )}
      </nav>
    </aside>
  );
}
