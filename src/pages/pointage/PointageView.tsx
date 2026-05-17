import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { addMonths, endOfMonth, format, isWeekend, startOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import { listWorkers } from '@/data/workers';
import { listAttendance } from '@/data/attendance';
import { useOrg } from '@/contexts/OrgContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { PointageGrid } from './PointageGrid';
import { formatMAD } from '@/lib/format';

interface PointageViewProps {
  chantierId: string;
}

/**
 * Self-contained pointage surface (month nav + summary cards + grid) scoped
 * to one chantier. Used standalone on /pointage (with a picker wrapper) and
 * embedded in the chantier-detail "Pointage" tab.
 */
export function PointageView({ chantierId }: PointageViewProps) {
  const { activeOrg } = useOrg();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  const workers = useQuery({
    queryKey: ['workers', activeOrg?.id],
    queryFn: () => listWorkers(),
    enabled: !!activeOrg,
  });

  const monthStart = month;
  const monthEnd = endOfMonth(month);
  const startIso = format(monthStart, 'yyyy-MM-dd');
  const endIso = format(monthEnd, 'yyyy-MM-dd');

  const attendance = useQuery({
    queryKey: ['attendance', activeOrg?.id, chantierId, startIso, endIso],
    queryFn: () =>
      listAttendance({
        chantierId,
        dateRange: { start: startIso, end: endIso },
      }),
    enabled: !!activeOrg && !!chantierId,
  });

  const days = useMemo(() => {
    const out: Date[] = [];
    const cursor = new Date(monthStart);
    while (cursor <= monthEnd) {
      out.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }, [monthStart, monthEnd]);

  const summary = useMemo(() => {
    const rows = attendance.data ?? [];
    let present = 0;
    let absent = 0;
    let primes = 0;
    for (const r of rows) {
      if (r.status === 'P') present++;
      else if (r.status === 'A') absent++;
      primes += Number(r.prime_amount) || 0;
    }
    const workerById = new Map((workers.data ?? []).map((w) => [w.id, w]));
    let laborCost = 0;
    for (const r of rows) {
      if (r.status === 'P') {
        const w = workerById.get(r.worker_id);
        if (w) laborCost += Number(w.daily_rate) || 0;
      }
    }
    laborCost += primes;
    return { present, absent, primes, laborCost };
  }, [attendance.data, workers.data]);

  const noWorker = workers.data !== undefined && workers.data.length === 0;

  if (noWorker) {
    return (
      <EmptyState
        title="Aucun ouvrier"
        description="Ajoutez des ouvriers pour pouvoir enregistrer leur pointage."
        action={
          <Link
            to="/ouvriers/new"
            className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium"
          >
            Ajouter un ouvrier
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bati-card rounded-md px-1 py-0.5">
          <button
            type="button"
            onClick={() => setMonth((m) => addMonths(m, -1))}
            className="px-2 py-1 text-bati-muted hover:text-bati-text hover:bg-bati-border-soft rounded"
            aria-label="Mois précédent"
          >
            ‹
          </button>
          <span className="px-3 text-sm font-medium text-bati-text min-w-[140px] text-center capitalize">
            {format(month, 'MMMM yyyy', { locale: fr })}
          </span>
          <button
            type="button"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            className="px-2 py-1 text-bati-muted hover:text-bati-text hover:bg-bati-border-soft rounded"
            aria-label="Mois suivant"
          >
            ›
          </button>
        </div>
        <button
          type="button"
          onClick={() => setMonth(startOfMonth(new Date()))}
          className="px-3 py-1 text-xs text-bati-muted hover:text-bati-text border border-bati-border rounded-md"
        >
          Aujourd&apos;hui
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Jours présents" value={summary.present} accent="success" />
        <SummaryCard label="Jours absents" value={summary.absent} accent="terra" />
        <SummaryCard
          label="Total primes"
          value={formatMAD(summary.primes)}
          accent="ochre"
        />
        <SummaryCard
          label="Coût main d'œuvre"
          value={formatMAD(summary.laborCost)}
          accent="teal"
        />
      </div>

      <PointageGrid
        chantierId={chantierId}
        workers={(workers.data ?? []).filter((w) => w.status === 'active')}
        days={days}
        attendance={attendance.data ?? []}
        isLoading={attendance.isLoading}
        queryKey={['attendance', activeOrg?.id, chantierId, startIso, endIso]}
        isWeekend={isWeekend}
      />
    </div>
  );
}

const ACCENT_CLASS: Record<string, string> = {
  teal: 'text-bati-teal',
  terra: 'text-bati-terra',
  ochre: 'text-bati-ochre',
  success: 'text-bati-success',
};

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  accent: 'teal' | 'terra' | 'ochre' | 'success';
}) {
  return (
    <div className="bati-card rounded-lg p-4">
      <div className="text-xs uppercase tracking-wide text-bati-muted">{label}</div>
      <div className={`text-xl font-bold mt-2 tabular-nums ${ACCENT_CLASS[accent]}`}>
        {value}
      </div>
    </div>
  );
}
