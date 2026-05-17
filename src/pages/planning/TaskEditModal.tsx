import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createTask,
  softDeleteTask,
  TASK_STATUS_LABEL,
  updateTask,
  type TaskStatus,
  type TaskWithAssignments,
} from '@/data/tasks';
import type { Worker } from '@/data/workers';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { useState } from 'react';

const STATUSES: TaskStatus[] = ['todo', 'ongoing', 'done', 'critical'];

const TaskSchema = z.object({
  label: z.string().trim().min(1, 'Libellé requis'),
  parent_task_id: z.string().trim(),
  start_date: z.string().trim(),
  duration_days: z.coerce.number().int().min(0, 'Durée ≥ 0').max(3650, 'Durée trop longue'),
  status: z.enum(['todo', 'ongoing', 'done', 'critical']),
  assignee_worker_ids: z.array(z.string().uuid()),
});
type TaskForm = z.input<typeof TaskSchema>;

export interface TaskEditModalProps {
  chantierId: string;
  /** When editing, the existing task with assignments. When creating, omit. */
  task: TaskWithAssignments | null;
  /** Sibling tasks (used to populate the parent-task select with valid options). */
  candidateParents: TaskWithAssignments[];
  workers: Worker[];
  onClose: () => void;
}

export function TaskEditModal({
  chantierId,
  task,
  candidateParents,
  workers,
  onClose,
}: TaskEditModalProps) {
  const queryClient = useQueryClient();
  const isEdit = task !== null;
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const defaultValues: TaskForm = useMemo(
    () => ({
      label: task?.label ?? '',
      parent_task_id: task?.parent_task_id ?? '',
      start_date: task?.start_date ?? '',
      duration_days: task?.duration_days ?? 1,
      status: task?.status ?? 'todo',
      assignee_worker_ids: task?.assignee_ids ?? [],
    }),
    [task]
  );

  const form = useForm<TaskForm>({
    resolver: zodResolver(TaskSchema),
    defaultValues,
  });

  const save = useMutation({
    mutationFn: async (v: z.output<typeof TaskSchema>) => {
      const payload = {
        label: v.label,
        parent_task_id: v.parent_task_id || null,
        start_date: v.start_date || null,
        duration_days: v.duration_days || null,
        status: v.status,
        assignee_worker_ids: v.assignee_worker_ids,
      };
      if (isEdit && task) {
        await updateTask(task.id, payload);
      } else {
        await createTask({
          chantier_id: chantierId,
          ...payload,
        });
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tasks', chantierId] });
      toast.success(isEdit ? 'Tâche mise à jour' : 'Tâche créée');
      onClose();
    },
    onError: (err) => toast.fromError(err, "Échec de l'enregistrement"),
  });

  const remove = useMutation({
    mutationFn: () => (task ? softDeleteTask(task.id) : Promise.resolve()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tasks', chantierId] });
      toast.success('Tâche supprimée');
      onClose();
    },
    onError: (err) => toast.fromError(err, 'Échec de la suppression'),
  });

  const onSubmit = form.handleSubmit((v) => save.mutate(TaskSchema.parse(v)));

  // Editing the task itself? Can't be its own parent. Also exclude descendants
  // to prevent cycles — for the MVP we exclude only the task itself (small
  // graphs in practice; cycle detection can come later if needed).
  const parentOptions = candidateParents.filter((p) => !task || p.id !== task.id);

  function toggleAssignee(id: string) {
    const current = form.getValues('assignee_worker_ids');
    if (current.includes(id)) {
      form.setValue(
        'assignee_worker_ids',
        current.filter((w) => w !== id),
        { shouldDirty: true }
      );
    } else {
      form.setValue('assignee_worker_ids', [...current, id], { shouldDirty: true });
    }
  }

  const currentAssignees = form.watch('assignee_worker_ids');

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={isEdit ? 'Modifier la tâche' : 'Nouvelle tâche'}
      size="lg"
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label className="block text-xs font-medium text-bati-muted mb-1">
            Libellé <span className="text-bati-terra">*</span>
          </label>
          <input
            type="text"
            className="bati-input"
            autoFocus
            placeholder="ex. Coulage dalle étage"
            {...form.register('label')}
          />
          {form.formState.errors.label && (
            <p className="text-xs text-bati-terra mt-1" role="alert">
              {form.formState.errors.label.message}
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Date de début
            </label>
            <input type="date" className="bati-input" {...form.register('start_date')} />
            <p className="text-[10px] text-bati-muted mt-1">
              Laisser vide pour empiler après la précédente
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Durée (jours)
            </label>
            <input
              type="number"
              min="0"
              className="bati-input"
              {...form.register('duration_days')}
            />
            {form.formState.errors.duration_days && (
              <p className="text-xs text-bati-terra mt-1" role="alert">
                {form.formState.errors.duration_days.message}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Statut
            </label>
            <select className="bati-input" {...form.register('status')}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-bati-muted mb-1">
            Tâche parente
          </label>
          <select className="bati-input" {...form.register('parent_task_id')}>
            <option value="">— Aucune (tâche racine) —</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-bati-muted mt-1">
            Regroupez les sous-étapes sous une tâche parente.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-bati-muted mb-2">
            Ouvriers assignés ({currentAssignees.length})
          </label>
          {workers.length === 0 ? (
            <p className="text-xs text-bati-muted italic">Aucun ouvrier disponible.</p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto border border-bati-border rounded-md p-2">
              {workers.map((w) => {
                const checked = currentAssignees.includes(w.id);
                return (
                  <label
                    key={w.id}
                    className={`flex items-center gap-2 px-2 py-1 rounded text-sm cursor-pointer ${
                      checked ? 'bg-bati-teal-soft text-bati-teal' : 'hover:bg-bati-border-soft'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAssignee(w.id)}
                      className="accent-bati-teal"
                    />
                    <span className="truncate">{w.full_name}</span>
                    {w.role && (
                      <span className="text-[10px] text-bati-muted truncate">· {w.role}</span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-bati-border">
          <div>
            {isEdit && (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={save.isPending || remove.isPending}
                className="px-3 py-2 text-sm text-bati-terra hover:bg-bati-terra-soft rounded-md transition-colors disabled:opacity-50"
              >
                Supprimer
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={save.isPending || remove.isPending}
              className="px-4 py-2 text-sm text-bati-text hover:bg-bati-border-soft rounded-md transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={save.isPending || remove.isPending}
              className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={(o) => !o && setConfirmingDelete(false)}
        title="Supprimer cette tâche ?"
        description="La tâche sera archivée (soft-delete). Les assignations d'ouvriers seront détachées. Les sous-tâches doivent être déplacées ou supprimées d'abord."
        confirmLabel="Supprimer"
        destructive
        onConfirm={async () => {
          await remove.mutateAsync();
        }}
      />
    </Modal>
  );
}
