import type { ChantierStatus } from '@/data/chantiers';
import { CHANTIER_STATUS_LABEL } from '@/data/chantiers';

const STATUS_CLASS: Record<ChantierStatus, string> = {
  active: 'bg-bati-teal-soft text-bati-teal',
  paused: 'bg-bati-border-soft text-bati-muted',
  completed: 'bg-[#D8EBDD] text-bati-success',
  cancelled: 'bg-bati-terra-soft text-bati-terra',
};

export function StatusBadge({ status }: { status: ChantierStatus }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS[status]}`}
    >
      {CHANTIER_STATUS_LABEL[status]}
    </span>
  );
}
