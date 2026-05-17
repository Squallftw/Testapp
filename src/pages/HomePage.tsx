import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOrg } from '@/contexts/OrgContext';
import { clearDemoData, hasDemoData, seedDemoData } from '@/data/seed-demo';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';

interface CardProps {
  title: string;
  value: React.ReactNode;
  hint: string;
  to?: string;
  accent?: 'teal' | 'terra' | 'ochre' | 'success';
}

const ACCENT_CLASS: Record<NonNullable<CardProps['accent']>, string> = {
  teal: 'text-bati-teal',
  terra: 'text-bati-terra',
  ochre: 'text-bati-ochre',
  success: 'text-bati-success',
};

function Card({ title, value, hint, to, accent = 'teal' }: CardProps) {
  const body = (
    <div className="bati-card rounded-lg p-5 h-full flex flex-col justify-between transition-shadow hover:shadow-md">
      <div className="text-xs uppercase tracking-wide text-bati-muted">{title}</div>
      <div className={`text-3xl font-bold mt-3 ${ACCENT_CLASS[accent]}`}>{value}</div>
      <div className="text-xs text-bati-muted mt-3 leading-relaxed">{hint}</div>
    </div>
  );
  if (to) {
    return (
      <Link to={to} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-bati-teal rounded-lg">
        {body}
      </Link>
    );
  }
  return body;
}

export default function HomePage() {
  const { activeOrg } = useOrg();

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-bati-text">
          {activeOrg ? `Bonjour — ${activeOrg.name}` : 'Tableau de bord'}
        </h1>
        <p className="text-sm text-bati-muted mt-1">
          Vue d&apos;ensemble de votre activité chantier.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          title="Chantiers actifs"
          value={<span className="text-bati-muted">—</span>}
          hint="À venir : nombre de chantiers en cours."
          to="/chantiers"
          accent="teal"
        />
        <Card
          title="Pointage aujourd'hui"
          value={<span className="text-bati-muted">—</span>}
          hint="À venir : ouvriers présents aujourd'hui."
          to="/pointage"
          accent="success"
        />
        <Card
          title="Stock bas"
          value={<span className="text-bati-muted">—</span>}
          hint="À venir : articles sous le seuil de réapprovisionnement."
          to="/consommables"
          accent="ochre"
        />
        <Card
          title="Budget consommé"
          value={<span className="text-bati-muted">—</span>}
          hint="À venir : chantier avec l'écart budgétaire le plus élevé."
          to="/budget"
          accent="terra"
        />
      </div>

      {import.meta.env.DEV && activeOrg && <DemoDataCard />}

      <div className="bati-card rounded-lg p-6">
        <h2 className="text-base font-bold text-bati-teal mb-2">Bienvenue dans BatiTrack</h2>
        <p className="text-sm text-bati-muted leading-relaxed">
          Cette plateforme arrive progressivement. Les fonctionnalités sont activées
          au fil des livraisons :
        </p>
        <ul className="text-sm text-bati-text mt-3 space-y-1.5 list-disc list-inside marker:text-bati-muted">
          <li>Gestion des chantiers, ouvriers et membres de l&apos;organisation</li>
          <li>Pointage quotidien et quinzaine avec primes et absences</li>
          <li>Suivi des consommables : achats, consommation, transferts, ajustements</li>
          <li>Tableau de bord budgétaire par chantier (main d&apos;œuvre / matériaux)</li>
        </ul>
      </div>
    </div>
  );
}

const DEMO_INVALIDATION_KEYS = [
  ['chantiers'],
  ['workers'],
  ['suppliers'],
  ['items'],
  ['purchases'],
  ['consumption'],
  ['attendance'],
  ['budget-summaries'],
  ['stock-on-hand'],
  ['tasks'],
];

function DemoDataCard() {
  const queryClient = useQueryClient();
  const [confirmingClear, setConfirmingClear] = useState(false);

  const present = useQuery({
    queryKey: ['demo-data-present'],
    queryFn: () => hasDemoData(),
  });

  const seed = useMutation({
    mutationFn: () => seedDemoData(),
    onSuccess: async (counts) => {
      toast.success(
        `Démo chargée — ${counts.chantiers} chantiers · ${counts.workers} ouvriers · ${counts.purchases} achats · ${counts.attendance} pointages · ${counts.tasks} tâches`
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['demo-data-present'] }),
        ...DEMO_INVALIDATION_KEYS.map((key) =>
          queryClient.invalidateQueries({ queryKey: key })
        ),
      ]);
    },
    onError: (err) => toast.fromError(err, 'Échec du chargement de la démo'),
  });

  const clear = useMutation({
    mutationFn: () => clearDemoData(),
    onSuccess: async ({ deleted }) => {
      toast.success(`Données de démo effacées (${deleted} enregistrements)`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['demo-data-present'] }),
        ...DEMO_INVALIDATION_KEYS.map((key) =>
          queryClient.invalidateQueries({ queryKey: key })
        ),
      ]);
    },
    onError: (err) => toast.fromError(err, "Échec de l'effacement"),
  });

  const isPresent = present.data === true;
  const isBusy = seed.isPending || clear.isPending;

  return (
    <div className="bati-card rounded-lg p-5 border-dashed">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-wide text-bati-muted">
            Mode développement
          </div>
          <h2 className="text-base font-bold text-bati-text mt-0.5">
            Données de démo
          </h2>
          <p className="text-xs text-bati-muted mt-1 max-w-xl leading-relaxed">
            Crée 2 chantiers (un terminé en dépassement, un en cours sain), 6 ouvriers,
            2 fournisseurs, 8 articles, 4 achats et plusieurs semaines de pointage et
            de consommation. Idéal pour vérifier que chaque écran affiche des chiffres
            cohérents.
          </p>
          <p className="text-xs text-bati-muted mt-1">
            État&nbsp;:{' '}
            {present.isLoading ? (
              <span>vérification…</span>
            ) : isPresent ? (
              <span className="text-bati-success font-medium">Démo chargée</span>
            ) : (
              <span>Aucune donnée de démo</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => seed.mutate()}
            disabled={isBusy || isPresent || present.isLoading}
            className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-40"
          >
            {seed.isPending ? 'Chargement…' : 'Charger les données de démo'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmingClear(true)}
            disabled={isBusy || !isPresent}
            className="px-4 py-2 border border-bati-terra text-bati-terra rounded-md text-sm font-medium hover:bg-bati-terra hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-bati-terra transition-colors"
          >
            Effacer les données de démo
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmingClear}
        onOpenChange={(o) => !o && setConfirmingClear(false)}
        title="Effacer les données de démo ?"
        description={
          <span>
            Tous les chantiers, ouvriers, fournisseurs, articles, achats, pointages et
            consommations préfixés «&nbsp;Démo&nbsp;·&nbsp;» seront supprimés. Vos vraies
            données ne sont pas touchées.
          </span>
        }
        confirmLabel="Effacer"
        destructive
        onConfirm={async () => {
          await clear.mutateAsync();
        }}
      />
    </div>
  );
}
