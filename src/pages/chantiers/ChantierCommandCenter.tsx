import { useChantierForesight } from '@/data/foresight';
import type { CostProjection, ScheduleProjection } from '@/lib/foresight';
import { formatDate, formatMAD, formatPercent } from '@/lib/format';
import { ProjectionCard } from '@/components/dashboard/ProjectionCard';
import { RiskBadge } from '@/components/dashboard/RiskBadge';

interface ChantierCommandCenterProps {
  chantierId: string;
}

const INSUFFICIENT_REASON_FR: Record<string, string> = {
  no_dates: 'Dates non renseignées',
  no_budget: 'Budget non défini',
  too_early: 'Moins de 7 jours écoulés',
  invalid_dates: 'Dates incohérentes',
  no_tasks: 'Aucune tâche planifiée',
  no_velocity: 'Aucune tâche terminée',
};

export function ChantierCommandCenter({ chantierId }: ChantierCommandCenterProps) {
  const { data, isLoading, isError, error } = useChantierForesight(chantierId);

  if (isLoading) {
    return (
      <div className="bati-card rounded-xl p-6 text-sm text-bati-muted">
        Calcul des projections…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bati-card rounded-xl p-6 text-sm text-bati-terra">
        Impossible de calculer les projections.
        {error instanceof Error ? <> ({error.message})</> : null}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="bati-card rounded-xl p-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-bati-muted">
            État global du chantier
          </div>
          <div className="mt-1 text-sm text-bati-muted">
            Projections basées sur le rythme actuel
          </div>
        </div>
        <RiskBadge level={data.risk.level} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <CostProjectionCard cost={data.cost} />
        <ScheduleProjectionCard schedule={data.schedule} />
        <AdherenceCard schedule={data.schedule} />
      </div>

      <RiskDrivers drivers={data.risk.drivers} />
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────

function CostProjectionCard({ cost }: { cost: CostProjection }) {
  if (cost.kind !== 'ok') {
    return (
      <ProjectionCard
        label="Coût final projeté"
        value={null}
        insufficientReason={INSUFFICIENT_REASON_FR[cost.reason] ?? cost.reason}
      />
    );
  }
  const tone =
    cost.variancePct >= 0.15
      ? 'danger'
      : cost.variancePct >= 0.05
        ? 'warning'
        : cost.variancePct <= -0.05
          ? 'success'
          : 'neutral';
  return (
    <ProjectionCard
      label="Coût final projeté"
      value={formatMAD(cost.projected)}
      sublabel={`Budget ${formatMAD(cost.budget)}`}
      delta={`${cost.variancePct >= 0 ? '+' : ''}${formatPercent(cost.variancePct)}`}
      tone={tone}
    />
  );
}

function ScheduleProjectionCard({ schedule }: { schedule: ScheduleProjection }) {
  if (schedule.kind !== 'ok') {
    return (
      <ProjectionCard
        label="Date de livraison projetée"
        value={null}
        insufficientReason={INSUFFICIENT_REASON_FR[schedule.reason] ?? schedule.reason}
      />
    );
  }
  const tone =
    schedule.deltaDays >= 15
      ? 'danger'
      : schedule.deltaDays >= 5
        ? 'warning'
        : schedule.deltaDays <= -5
          ? 'success'
          : 'neutral';
  const deltaLabel =
    schedule.deltaDays === 0
      ? 'À l\'heure'
      : `${schedule.deltaDays > 0 ? '+' : ''}${schedule.deltaDays} j`;
  return (
    <ProjectionCard
      label="Date de livraison projetée"
      value={formatDate(schedule.projectedEndDate)}
      sublabel={`Prévue ${formatDate(schedule.plannedEndDate)}`}
      delta={deltaLabel}
      tone={tone}
    />
  );
}

function AdherenceCard({ schedule }: { schedule: ScheduleProjection }) {
  if (schedule.kind !== 'ok') {
    return (
      <ProjectionCard
        label="Adhérence au planning"
        value={null}
        insufficientReason={INSUFFICIENT_REASON_FR[schedule.reason] ?? schedule.reason}
      />
    );
  }
  const pct = schedule.scheduleAdherencePct;
  const tone =
    pct >= 0.95 && pct <= 1.15
      ? 'success'
      : pct >= 0.8
        ? 'warning'
        : 'danger';
  return (
    <ProjectionCard
      label="Adhérence au planning"
      value={formatPercent(pct)}
      sublabel={
        pct >= 1 ? 'En avance sur le rythme' : 'En retard sur le rythme'
      }
      tone={tone}
    />
  );
}

function RiskDrivers({ drivers }: { drivers: { kind: string; severity: string; message: string }[] }) {
  if (drivers.length === 0) {
    return (
      <div className="bati-card rounded-xl p-4 flex items-center gap-3 text-sm">
        <span className="w-2 h-2 rounded-full bg-bati-success" aria-hidden />
        <span className="text-bati-text font-medium">Tout est sur les rails.</span>
        <span className="text-bati-muted">Aucune alerte active.</span>
      </div>
    );
  }
  return (
    <div className="bati-card rounded-xl p-4">
      <div className="text-xs uppercase tracking-wide text-bati-muted mb-3">
        Points d&apos;attention
      </div>
      <ul className="space-y-2">
        {drivers.map((d, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm">
            <span
              className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                d.severity === 'critical'
                  ? 'bg-bati-terra'
                  : d.severity === 'warning'
                    ? 'bg-bati-ochre'
                    : 'bg-bati-muted'
              }`}
              aria-hidden
            />
            <span className="text-bati-text">{d.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
