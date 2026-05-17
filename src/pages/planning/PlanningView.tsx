import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listWorkers } from '@/data/workers';
import { listTasksForChantier, type TaskWithAssignments } from '@/data/tasks';
import { useOrg } from '@/contexts/OrgContext';
import { PlanningGantt } from './PlanningGantt';
import { TaskEditModal } from './TaskEditModal';
import { ZOOM_LABEL, ZOOM_PX, type ZoomLevel } from './zoom';

interface PlanningViewProps {
  chantierId: string;
}

/**
 * Self-contained planning surface (Gantt + zoom toolbar + edit modal + add
 * button) scoped to one chantier. Used standalone on /planning and embedded
 * in the chantier-detail "Planning" tab.
 */
export function PlanningView({ chantierId }: PlanningViewProps) {
  const { activeOrg } = useOrg();
  const [zoom, setZoom] = useState<ZoomLevel>('week');
  const [editing, setEditing] = useState<{ task: TaskWithAssignments | null } | null>(null);

  const workers = useQuery({
    queryKey: ['workers', activeOrg?.id],
    queryFn: () => listWorkers(),
    enabled: !!activeOrg,
  });

  const tasks = useQuery({
    queryKey: ['tasks', chantierId],
    queryFn: () => listTasksForChantier(chantierId),
    enabled: !!chantierId,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex border border-bati-border rounded-md overflow-hidden">
          {(Object.keys(ZOOM_PX) as ZoomLevel[]).map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoom(z)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                zoom === z
                  ? 'bg-bati-teal text-white'
                  : 'bg-bati-card text-bati-muted hover:bg-bati-border-soft'
              }`}
            >
              {ZOOM_LABEL[z]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setEditing({ task: null })}
          className="px-3 py-1.5 bg-bati-teal text-white rounded-md text-sm font-medium hover:opacity-90"
        >
          Nouvelle tâche
        </button>
      </div>

      {tasks.isLoading ? (
        <div className="bati-card rounded-lg p-8 text-center text-sm text-bati-muted">
          Chargement des tâches…
        </div>
      ) : (
        <PlanningGantt
          chantierId={chantierId}
          tasks={tasks.data ?? []}
          zoom={zoom}
          onEditTask={(t) => setEditing({ task: t })}
          onCreateTask={() => setEditing({ task: null })}
        />
      )}

      {editing && (
        <TaskEditModal
          chantierId={chantierId}
          task={editing.task}
          candidateParents={tasks.data ?? []}
          workers={(workers.data ?? []).filter((w) => w.status === 'active')}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
