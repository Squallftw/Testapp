import type { ChantierStatus } from '@/data/chantiers';
import { CHANTIER_STATUS_LABEL } from '@/data/chantiers';

const STATUS_CLASS: Record<ChantierStatus, string> = {
  active: 'bg-bati-primary-soft text-bati-primary-deep',
  paused: 'bg-bati-border-soft text-bati-muted',
  completed: 'bg-bati-success-soft text-[#067647]',
  cancelled: 'bg-bati-terra-soft text-[#9a2a17]',
};

export function StatusBadge({ status }: { status: ChantierStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS[status]}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" aria-hidden />
      {CHANTIER_STATUS_LABEL[status]}
    </span>
  );
}
