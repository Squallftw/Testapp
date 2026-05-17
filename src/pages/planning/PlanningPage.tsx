import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listChantiers } from '@/data/chantiers';
import { listWorkers } from '@/data/workers';
import { listTasksForChantier, type TaskWithAssignments } from '@/data/tasks';
import { useChantier } from '@/contexts/ChantierContext';
import { useOrg } from '@/contexts/OrgContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { PlanningGantt } from './PlanningGantt';
import { TaskEditModal } from './TaskEditModal';
import { ZOOM_LABEL, ZOOM_PX, type ZoomLevel } from './zoom';

export default function PlanningPage() {
  const { activeOrg } = useOrg();
  const { activeChantierId, setActiveChantier } = useChantier();
  const [zoom, setZoom] = useState<ZoomLevel>('week');
  const [editing, setEditing] = useState<{ task: TaskWithAssignments | null } | null>(null);

  const chantiers = useQuery({
    queryKey: ['chantiers', activeOrg?.id],
    queryFn: () => listChantiers(),
    enabled: !!activeOrg,
  });

  const workers = useQuery({
    queryKey: ['workers', activeOrg?.id],
    queryFn: () => listWorkers(),
    enabled: !!activeOrg,
  });

  const tasks = useQuery({
    queryKey: ['tasks', activeChantierId],
    queryFn: () => listTasksForChantier(activeChantierId!),
    enabled: !!activeChantierId,
  });

  const activeChantier = useMemo(
    () => (chantiers.data ?? []).find((c) => c.id === activeChantierId) ?? null,
    [chantiers.data, activeChantierId]
  );

  if (chantiers.isLoading) {
    return <div className="text-sm text-bati-muted">Chargement…</div>;
  }

  if ((chantiers.data?.length ?? 0) === 0) {
    return (
      <EmptyState
        title="Aucun chantier"
        description="Créez un chantier pour pouvoir planifier ses tâches."
        action={
          <Link
            to="/chantiers/new"
            className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium"
          >
            Créer un chantier
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-bati-text">Planning</h1>
          <p className="text-sm text-bati-muted mt-0.5">
            Tâches sur l&apos;échelle de temps · drag pour replanifier.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing({ task: null })}
            disabled={!activeChantierId}
            className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            Nouvelle tâche
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-bati-muted mb-1">
            Chantier
          </label>
          <select
            value={activeChantierId ?? ''}
            onChange={(e) => setActiveChantier(e.target.value || null)}
            className="bati-input min-w-[260px]"
          >
            <option value="">— Choisir un chantier —</option>
            {(chantiers.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-bati-muted mb-1">
            Zoom
          </label>
          <div className="inline-flex border border-bati-border rounded-md overflow-hidden">
            {(Object.keys(ZOOM_PX) as ZoomLevel[]).map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => setZoom(z)}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  zoom === z
                    ? 'bg-bati-teal text-white'
                    : 'bg-bati-card text-bati-muted hover:bg-bati-border-soft'
                }`}
              >
                {ZOOM_LABEL[z]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!activeChantierId && (
        <EmptyState
          title="Sélectionnez un chantier"
          description="Le planning affiche les tâches d&apos;un chantier à la fois."
        />
      )}

      {activeChantierId && tasks.isLoading && (
        <div className="bati-card rounded-lg p-8 text-center text-sm text-bati-muted">
          Chargement des tâches…
        </div>
      )}

      {activeChantier && tasks.data && (
        <PlanningGantt
          chantierId={activeChantierId!}
          tasks={tasks.data}
          zoom={zoom}
          onEditTask={(t) => setEditing({ task: t })}
          onCreateTask={() => setEditing({ task: null })}
        />
      )}

      {editing && activeChantierId && (
        <TaskEditModal
          chantierId={activeChantierId}
          task={editing.task}
          candidateParents={tasks.data ?? []}
          workers={(workers.data ?? []).filter((w) => w.status === 'active')}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
