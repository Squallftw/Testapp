import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import {
  ABSENCE_REASONS,
  deleteAttendance,
  upsertAttendance,
  type Attendance,
  type AttendanceStatus,
} from '@/data/attendance';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';

interface PointagePopoverProps {
  chantierId: string;
  workerId: string;
  date: string;
  cell: Attendance | undefined;
  queryKey: QueryKey;
  onClose: () => void;
}

export function PointagePopover({
  chantierId,
  workerId,
  date,
  cell,
  queryKey,
  onClose,
}: PointagePopoverProps) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AttendanceStatus>(cell?.status ?? 'P');
  const [prime, setPrime] = useState(String(cell?.prime_amount ?? 0));
  const [primeMotif, setPrimeMotif] = useState(cell?.prime_motif ?? '');
  const [absenceReason, setAbsenceReason] = useState(cell?.absence_reason ?? '');
  const [note, setNote] = useState(cell?.note ?? '');

  const save = useMutation({
    mutationFn: () =>
      upsertAttendance({
        chantier_id: chantierId,
        worker_id: workerId,
        attendance_date: date,
        status,
        prime_amount: Number(prime) || 0,
        prime_motif: primeMotif.trim() || null,
        absence_reason: status === 'A' ? absenceReason || null : null,
        note: note.trim() || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success('Pointage enregistré');
      onClose();
    },
    onError: (err) => toast.fromError(err, "Échec de l'enregistrement"),
  });

  const remove = useMutation({
    mutationFn: () => deleteAttendance(cell!.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success('Pointage supprimé');
      onClose();
    },
    onError: (err) => toast.fromError(err, 'Échec de la suppression'),
  });

  return (
    <Modal
      open={true}
      onOpenChange={(o) => !o && onClose()}
      title={`Pointage du ${date}`}
      size="md"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-bati-muted mb-2">
            Statut
          </label>
          <div className="flex gap-2">
            {(['P', 'A'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  status === s
                    ? s === 'P'
                      ? 'bg-bati-teal text-white'
                      : 'bg-bati-terra text-white'
                    : 'bg-bati-card border border-bati-border text-bati-muted hover:bg-bati-border-soft'
                }`}
              >
                {s === 'P' ? 'Présent' : 'Absent'}
              </button>
            ))}
          </div>
        </div>

        {status === 'A' && (
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Motif d&apos;absence
            </label>
            <select
              value={absenceReason ?? ''}
              onChange={(e) => setAbsenceReason(e.target.value)}
              className="bati-input"
            >
              <option value="">— Choisir —</option>
              {ABSENCE_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Prime (MAD)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={prime}
              onChange={(e) => setPrime(e.target.value)}
              className="bati-input"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Motif de la prime
            </label>
            <input
              type="text"
              value={primeMotif ?? ''}
              onChange={(e) => setPrimeMotif(e.target.value)}
              className="bati-input"
              placeholder="Ex : heures sup."
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-bati-muted mb-1">
            Note
          </label>
          <textarea
            value={note ?? ''}
            onChange={(e) => setNote(e.target.value)}
            className="bati-input"
            rows={2}
          />
        </div>

        <div className="flex flex-col sm:flex-row sm:justify-between gap-2 pt-2">
          <div>
            {cell && !cell.id.startsWith('optimistic-') && (
              <button
                type="button"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
                className="px-3 py-2 text-sm text-bati-terra border border-bati-terra-soft rounded-md hover:bg-bati-terra-soft disabled:opacity-50"
              >
                Supprimer le pointage
              </button>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-bati-text hover:bg-bati-border-soft rounded-md"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
