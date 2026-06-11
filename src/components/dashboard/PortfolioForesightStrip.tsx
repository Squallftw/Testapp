import { formatMAD, formatPercent } from '@/lib/format';
import type { OrgForesight } from '@/lib/foresight';

interface PortfolioForesightStripProps {
  foresight: OrgForesight | undefined;
  isLoading?: boolean;
}

export function PortfolioForesightStrip({
  foresight,
  isLoading = false,
}: PortfolioForesightStripProps) {
  const variance = foresight?.portfolioVariance ?? 0;
  const adherence = foresight?.avgScheduleAdherence;
  const counts = foresight?.riskCounts ?? { green: 0, yellow: 0, red: 0 };

  const varianceTone =
    variance > 0 ? 'text-bati-terra' : variance < 0 ? 'text-bati-success' : 'text-bati-text';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Card label="Variance projetée">
        {isLoading ? (
          <Skeleton />
        ) : (
          <span className={`text-2xl font-bold tabular-nums ${varianceTone}`}>
            {variance >= 0 ? '+' : '−'}
            {formatMAD(Math.abs(variance))}
          </span>
        )}
        <span className="text-xs text-bati-muted mt-1 block">
          Σ projeté − Σ budget (chantiers actifs)
        </span>
      </Card>

      <Card label="Adhérence moyenne">
        {isLoading ? (
          <Skeleton />
        ) : Number.isFinite(adherence) && adherence !== undefined ? (
          <span
            className={`text-2xl font-bold tabular-nums ${
              adherence >= 0.95 && adherence <= 1.15
                ? 'text-bati-success'
                : adherence >= 0.8
                  ? 'text-bati-ochre'
                  : 'text-bati-terra'
            }`}
          >
            {formatPercent(adherence)}
          </span>
        ) : (
          <span className="text-2xl font-bold text-bati-muted">—</span>
        )}
        <span className="text-xs text-bati-muted mt-1 block">
          Tâches faites vs planning attendu
        </span>
      </Card>

      <Card label="Répartition des risques">
        {isLoading ? (
          <Skeleton />
        ) : (
          <div className="flex items-center gap-4 mt-0.5">
            <RiskCount tone="success" count={counts.green} label="sains" />
            <RiskCount tone="ochre" count={counts.yellow} label="à surveiller" />
            <RiskCount tone="terra" count={counts.red} label="à risque" />
          </div>
        )}
        <span className="text-xs text-bati-muted mt-1 block">
          Chantiers actifs par niveau de risque
        </span>
      </Card>
    </div>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bati-card rounded-xl p-4">
      <div className="text-xs uppercase tracking-wide text-bati-muted">{label}</div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Skeleton() {
  return <span className="text-2xl font-bold text-bati-muted">…</span>;
}

const DOT_BG: Record<'success' | 'ochre' | 'terra', string> = {
  success: 'bg-bati-success',
  ochre: 'bg-bati-ochre',
  terra: 'bg-bati-terra',
};
const DOT_TEXT: Record<'success' | 'ochre' | 'terra', string> = {
  success: 'text-bati-success',
  ochre: 'text-bati-ochre',
  terra: 'text-bati-terra',
};

function RiskCount({
  tone,
  count,
  label,
}: {
  tone: 'success' | 'ochre' | 'terra';
  count: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${DOT_BG[tone]}`} aria-hidden />
      <span className={`text-xl font-bold tabular-nums ${DOT_TEXT[tone]}`}>
        {count}
      </span>
      <span className="text-xs text-bati-muted">{label}</span>
    </div>
  );
}
