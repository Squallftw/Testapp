import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWorker,
  getWorker,
  hueToColor,
  softDeleteWorker,
  updateWorker,
  type Worker,
} from '@/data/workers';
import { useOrg } from '@/contexts/OrgContext';
import { toast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const ROLE_SUGGESTIONS = [
  'Maçon',
  'Chef d\'équipe',
  'Manœuvre',
  'Électricien',
  'Plombier',
  'Peintre',
  'Ferrailleur',
  'Soudeur',
  'Conducteur d\'engin',
  'Chauffeur',
  'Coffreur',
  'Carreleur',
  'Charpentier',
];

// Discrete palette of hues — visually distinct on the pointage grid.
const HUE_PALETTE = [0, 30, 60, 100, 140, 180, 210, 240, 280, 320];

const FormSchema = z.object({
  full_name: z.string().trim().min(1, 'Le nom est requis'),
  role: z.string().trim(),
  daily_rate: z.coerce.number().min(0, 'Doit être ≥ 0').max(1e7),
  phone: z.string().trim(),
  cin: z.string().trim(),
  hire_date: z.string(),
  status: z.enum(['active', 'inactive']),
  hue: z.coerce.number().min(0).max(360),
});

type FormValues = z.input<typeof FormSchema>;

const DEFAULT_VALUES: FormValues = {
  full_name: '',
  role: '',
  daily_rate: 0,
  phone: '',
  cin: '',
  hire_date: '',
  status: 'active',
  hue: HUE_PALETTE[0]!,
};

function workerToFormValues(w: Worker): FormValues {
  return {
    full_name: w.full_name,
    role: w.role ?? '',
    daily_rate: Number(w.daily_rate),
    phone: w.phone ?? '',
    cin: w.cin ?? '',
    hire_date: w.hire_date ?? '',
    status: w.status,
    hue: w.hue ?? HUE_PALETTE[0]!,
  };
}

function blank(v: string): string | null {
  return v === '' ? null : v;
}

export default function WorkerEditPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeOrg } = useOrg();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const existing = useQuery({
    queryKey: ['worker', id],
    queryFn: () => getWorker(id!),
    enabled: !isNew && !!id && !!activeOrg,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  useEffect(() => {
    if (!isNew && existing.data) {
      form.reset(workerToFormValues(existing.data));
    }
  }, [isNew, existing.data, form]);

  const create = useMutation({
    mutationFn: (values: z.output<typeof FormSchema>) =>
      createWorker({
        full_name: values.full_name,
        role: blank(values.role),
        daily_rate: values.daily_rate,
        phone: blank(values.phone),
        cin: blank(values.cin),
        hire_date: blank(values.hire_date),
        status: values.status,
        hue: values.hue,
        user_id: null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workers'] });
      toast.success('Ouvrier ajouté');
      navigate('/ouvriers');
    },
    onError: (err) => toast.fromError(err, 'Échec de la création'),
  });

  const update = useMutation({
    mutationFn: (values: z.output<typeof FormSchema>) =>
      updateWorker(id!, {
        full_name: values.full_name,
        role: blank(values.role),
        daily_rate: values.daily_rate,
        phone: blank(values.phone),
        cin: blank(values.cin),
        hire_date: blank(values.hire_date),
        status: values.status,
        hue: values.hue,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workers'] });
      await queryClient.invalidateQueries({ queryKey: ['worker', id] });
      toast.success('Ouvrier mis à jour');
      navigate('/ouvriers');
    },
    onError: (err) => toast.fromError(err, 'Échec de la mise à jour'),
  });

  const remove = useMutation({
    mutationFn: () => softDeleteWorker(id!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workers'] });
      toast.success('Ouvrier archivé');
      navigate('/ouvriers');
    },
    onError: (err) => toast.fromError(err, 'Échec de la suppression'),
  });

  const onSubmit = form.handleSubmit((values) => {
    const parsed = FormSchema.parse(values);
    if (isNew) create.mutate(parsed);
    else update.mutate(parsed);
  });

  const pending = create.isPending || update.isPending;

  if (!isNew && existing.isLoading) {
    return <div className="text-sm text-bati-muted">Chargement…</div>;
  }

  if (!isNew && existing.isError) {
    return (
      <div className="bati-card rounded-lg p-6 max-w-md">
        <h2 className="text-base font-bold text-bati-terra">Ouvrier introuvable</h2>
        <Link to="/ouvriers" className="mt-4 inline-block text-sm text-bati-teal hover:underline">
          Retour à la liste
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link
          to="/ouvriers"
          className="text-xs text-bati-muted hover:text-bati-text inline-flex items-center gap-1"
        >
          <span aria-hidden>←</span> Retour aux ouvriers
        </Link>
        <h1 className="text-2xl font-bold text-bati-text mt-2">
          {isNew ? 'Nouvel ouvrier' : `Modifier — ${form.watch('full_name') || ''}`}
        </h1>
      </div>

      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <Section title="Identité">
          <Field label="Nom complet" required error={form.formState.errors.full_name?.message}>
            <input
              type="text"
              className="bati-input"
              {...form.register('full_name')}
              autoFocus={isNew}
            />
          </Field>
          <Field label="Métier" hint="Choisissez parmi les suggestions ou tapez librement.">
            <input
              type="text"
              list="role-suggestions"
              className="bati-input"
              {...form.register('role')}
            />
            <datalist id="role-suggestions">
              {ROLE_SUGGESTIONS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </Field>
          <Field
            label="CIN"
            hint="Information sensible — visible uniquement par owner/admin."
          >
            <input
              type="text"
              className="bati-input"
              placeholder="Ex : AB123456"
              {...form.register('cin')}
            />
          </Field>
          <Field label="Téléphone">
            <input
              type="tel"
              className="bati-input"
              placeholder="+212 6XX XX XX XX"
              {...form.register('phone')}
            />
          </Field>
        </Section>

        <Section title="Rémunération">
          <Field
            label="Taux journalier (MAD)"
            required
            error={form.formState.errors.daily_rate?.message}
            hint="Utilisé pour calculer le coût main d'œuvre au pointage."
          >
            <input
              type="number"
              step="0.01"
              min="0"
              className="bati-input"
              {...form.register('daily_rate')}
            />
          </Field>
          <Field label="Date d'embauche">
            <input type="date" className="bati-input" {...form.register('hire_date')} />
          </Field>
        </Section>

        <Section title="Pointage">
          <Field label="Couleur d'identification" hint="Visible dans la grille de pointage.">
            <div className="flex flex-wrap gap-2">
              {HUE_PALETTE.map((h) => {
                const selected = Number(form.watch('hue')) === h;
                return (
                  <button
                    type="button"
                    key={h}
                    onClick={() => form.setValue('hue', h)}
                    aria-pressed={selected}
                    className={`w-7 h-7 rounded-full transition-all ${
                      selected ? 'ring-2 ring-offset-2 ring-bati-text' : ''
                    }`}
                    style={{ background: hueToColor(h) }}
                  />
                );
              })}
            </div>
          </Field>
          <Field label="Statut">
            <div className="flex gap-2">
              {(['active', 'inactive'] as const).map((s) => {
                const selected = form.watch('status') === s;
                return (
                  <button
                    type="button"
                    key={s}
                    onClick={() => form.setValue('status', s)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      selected
                        ? 'bg-bati-teal text-white'
                        : 'bg-bati-card border border-bati-border text-bati-muted hover:bg-bati-border-soft'
                    }`}
                  >
                    {s === 'active' ? 'Actif' : 'Inactif'}
                  </button>
                );
              })}
            </div>
          </Field>
        </Section>

        <div className="flex flex-col sm:flex-row sm:justify-between gap-3 pt-2">
          <div>
            {!isNew && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="px-4 py-2 text-sm text-bati-terra border border-bati-terra-soft rounded-md hover:bg-bati-terra-soft"
              >
                Archiver l&apos;ouvrier
              </button>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Link
              to="/ouvriers"
              className="px-4 py-2 text-sm font-medium text-bati-text hover:bg-bati-border-soft rounded-md"
            >
              Annuler
            </Link>
            <button
              type="submit"
              disabled={pending}
              className="px-5 py-2 bg-bati-teal text-white rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {pending ? 'Enregistrement…' : isNew ? 'Ajouter' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Archiver cet ouvrier ?"
        description="L'ouvrier n'apparaîtra plus dans les listes ni dans la grille de pointage. Son historique reste préservé."
        confirmLabel="Archiver"
        destructive
        onConfirm={() => remove.mutateAsync()}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bati-card rounded-lg p-5">
      <h2 className="text-sm font-bold text-bati-text mb-4">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

function Field({ label, hint, error, required, children }: FieldProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-bati-muted mb-1">
        {label}
        {required && <span className="text-bati-terra ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-bati-muted mt-1">{hint}</p>}
      {error && (
        <p className="text-xs text-bati-terra mt-1" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
