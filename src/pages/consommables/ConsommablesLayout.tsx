import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { to: '/consommables/articles', label: 'Articles & stock' },
  { to: '/consommables/achats', label: 'Achats' },
  { to: '/consommables/consommation', label: 'Consommation' },
  { to: '/consommables/fournisseurs', label: 'Fournisseurs' },
  { to: '/consommables/mouvements', label: 'Mouvements' },
];

export default function ConsommablesLayout() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-bati-text">Matériaux</h1>
        <p className="text-sm text-bati-muted mt-0.5">
          Articles, achats, consommation, transferts et ajustements.
        </p>
      </div>
      <div className="flex border-b border-bati-border overflow-x-auto -mb-px">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? 'border-bati-teal text-bati-teal'
                  : 'border-transparent text-bati-muted hover:text-bati-text'
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
