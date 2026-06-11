import type { ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { PlanningView } from '@/pages/planning/PlanningView';
import { PointageView } from '@/pages/pointage/PointageView';
import { ChantierConsumablesView } from '@/pages/consommables/ChantierConsumablesView';
import {
  ChantierBudgetView,
  type ChantierBudgetTab,
} from '@/pages/budget/ChantierBudgetView';
import { ChantierMaterielsView } from '@/pages/materiels/ChantierMaterielsView';
import { formatMAD, formatDate } from '@/lib/format';
import { ChantierCommandCenter } from './ChantierCommandCenter';
import { useChantierDetail } from './chantier-detail-context';

/* Routed tab panels for the chantier detail layout (route config in App.tsx).
   One module on purpose: Vite emits a single chunk fetched together with the
   layout, so switching tabs never waits on the network. Each panel reads the
   already-loaded chantier from the layout's Outlet context. */

export function OverviewTab() {
  const { chantier: c } = useChantierDetail();
  return (
    <div className="space-y-6">
      <ChantierCommandCenter chantierId={c.id} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <InfoCard title="Informations">
          <InfoRow label="Chef de chantier" value={c.manager_name} />
          <InfoRow label="Client" value={c.client_name} />
          <InfoRow label="Adresse" value={c.address} />
          <InfoRow label="Type" value={c.type} />
        </InfoCard>
        <InfoCard title="Calendrier">
          <InfoRow label="Date de début" value={formatDate(c.date_start)} />
          <InfoRow label="Date de fin prévue" value={formatDate(c.date_end_prev)} />
          <InfoRow label="Créé le" value={formatDate(c.created_at)} />
        </InfoCard>
        <InfoCard title="Budget">
          <InfoRow label="Budget total" value={formatMAD(c.budget_total)} highlight />
          <InfoRow label="Main d'œuvre" value={formatMAD(c.budget_labor)} />
          <InfoRow label="Matériaux" value={formatMAD(c.budget_materials)} />
          <InfoRow label="Matériels" value={formatMAD(c.budget_equipment)} />
          <InfoRow
            label="Divers (calc.)"
            value={formatMAD(
              c.budget_total - c.budget_labor - c.budget_materials - c.budget_equipment
            )}
          />
        </InfoCard>
        <InfoCard title="Contrat">
          <InfoRow label="Valeur du contrat" value={formatMAD(c.contract_value)} />
          <InfoRow
            label="Marge potentielle"
            value={formatMAD(c.contract_value - c.budget_total)}
          />
        </InfoCard>
      </div>
    </div>
  );
}

export function PlanningTab() {
  const { chantier } = useChantierDetail();
  return <PlanningView chantierId={chantier.id} />;
}

export function PointageTab() {
  const { chantier } = useChantierDetail();
  return <PointageView chantierId={chantier.id} />;
}

export function MateriauxTab() {
  const { chantier } = useChantierDetail();
  return <ChantierConsumablesView chantierId={chantier.id} />;
}

export function MaterielsTab() {
  const { chantier } = useChantierDetail();
  return <ChantierMaterielsView chantierId={chantier.id} />;
}

/* Budget keeps its onNavigateTab prop (it threads down to the category
   dashboard modal); the legacy tab ids map onto route segments here. */
const SEGMENT: Record<ChantierBudgetTab, string> = {
  pointage: 'pointage',
  consommables: 'materiaux',
  materiels: 'materiels',
};

export function BudgetTab() {
  const { chantier } = useChantierDetail();
  const navigate = useNavigate();
  return (
    <ChantierBudgetView
      chantier={chantier}
      onNavigateTab={(t) => navigate(`/chantiers/${chantier.id}/${SEGMENT[t]}`)}
    />
  );
}

/** Catch-all for unknown tab segments → back to the overview. Absolute path
 *  on purpose — relative '..' is a footgun with v7_relativeSplatPath. */
export function RedirectToChantierIndex() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/chantiers/${id}`} replace />;
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bati-card rounded-lg p-5">
      <h3 className="text-xs uppercase tracking-wide text-bati-muted mb-3">{title}</h3>
      <dl className="space-y-2">{children}</dl>
    </div>
  );
}

function InfoRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline gap-3 text-sm">
      <dt className="text-bati-muted">{label}</dt>
      <dd
        className={`text-right tabular-nums ${
          highlight ? 'font-bold text-bati-text' : 'text-bati-text'
        }`}
      >
        {value || <span className="text-bati-muted">—</span>}
      </dd>
    </div>
  );
}
