import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CHANTIER_COLOR_PALETTE,
  CHANTIER_STATUS_LABEL,
  createChantier,
  getChantier,
  updateChantier,
  type Chantier,
  type ChantierStatus,
} from '@/data/chantiers';
import { useOrg } from '@/contexts/OrgContext';
import { toast } from '@/components/ui/Toast';

const STATUS: ChantierStatus[] = ['active', 'paused', 'completed', 'cancelled'];

// Schema uses input==output types: every field is a string or number with no
// nullish transforms — keeping it simple for react-hook-form v7's input/output
// type separation. Empty strings are normalised to null at submit time.
const FormSchema = z
  .object({
    name: z.string().trim().min(1, 'Le nom du chantier est requis'),
    type: z.string().trim(),
    color: z.string(),
    client_name: z.string().trim(),
    manager_name: z.string().trim(),
    address: z.string().trim(),
    date_start: z.string(),
    date_end_prev: z.string(),
    budget_total: z.coerce.number().min(0, 'Doit être ≥ 0').max(1e12),
    budget_labor: z.coerce.number().min(0, 'Doit être ≥ 0').max(1e12),
    budget_materials: z.coerce.number().min(0, 'Doit être ≥ 0').max(1e12),
    budget_equipment: z.coerce.number().min(0, 'Doit être ≥ 0').max(1e12),
    contract_value: z.coerce.number().min(0, 'Doit être ≥ 0').max(1e12),
    status: z.enum(['active', 'paused', 'completed', 'cancelled']),
  })
  .superRefine((data, ctx) => {
    if (
      data.budget_labor + data.budget_materials + data.budget_equipment >
      data.budget_total
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['budget_total'],
        message:
          'Le budget total doit être ≥ main d\'œuvre + matériaux + matériels (« divers » inclus).',
      });
    }
    if (data.date_start && data.date_end_prev && data.date_end_prev < data.date_start) {
      ctx.addIssue({
        code: 'custom',
        path: ['date_end_prev'],
        message: 'La date de fin doit être après la date de début.',
      });
    }
  });

type FormValues = z.input<typeof FormSchema>;

const DEFAULT_VALUES: FormValues = {
  name: '',
  type: '',
  color: CHANTIER_COLOR_PALETTE[0]!.color,
  client_name: '',
  manager_name: '',
  address: '',
  date_start: '',
  date_end_prev: '',
  budget_total: 0,
  budget_labor: 0,
  budget_materials: 0,
  budget_equipment: 0,
  contract_value: 0,
  status: 'active',
};

function chantierToFormValues(c: Chantier): FormValues {
  return {
    name: c.name,
    type: c.type ?? '',
    color: c.color ?? CHANTIER_COLOR_PALETTE[0]!.color,
    client_name: c.client_name ?? '',
    manager_name: c.manager_name ?? '',
    address: c.address ?? '',
    date_start: c.date_start ?? '',
    date_end_prev: c.date_end_prev ?? '',
    budget_total: Number(c.budget_total),
    budget_labor: Number(c.budget_labor),
    budget_materials: Number(c.budget_materials),
    budget_equipment: Number(c.budget_equipment),
    contract_value: Number(c.contract_value),
    status: c.status,
  };
}

/** Empty strings → null, for DB columns where empty != null. */
function blank(v: string): string | null {
  return v === '' ? null : v;
}

export default function ChantierEditPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeOrg } = useOrg();

  const existing = useQuery({
    queryKey: ['chantier', id],
    queryFn: () => getChantier(id!),
    enabled: !isNew && !!id && !!activeOrg,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  useEffect(() => {
    if (!isNew && existing.data) {
      form.reset(chantierToFormValues(existing.data));
    }
  }, [isNew, existing.data, form]);

  const create = useMutation({
    mutationFn: (values: z.output<typeof FormSchema>) => {
      const soft =
        CHANTIER_COLOR_PALETTE.find((p) => p.color === values.color)?.soft ?? null;
      return createChantier({
        name: values.name,
        type: blank(values.type),
        color: values.color,
        color_soft: soft,
        client_name: blank(values.client_name),
        manager_name: blank(values.manager_name),
        manager_user_id: null,
        address: blank(values.address),
        date_start: blank(values.date_start),
        date_end_prev: blank(values.date_end_prev),
        budget_total: values.budget_total,
        budget_labor: values.budget_labor,
        budget_materials: values.budget_materials,
        budget_equipment: values.budget_equipment,
        contract_value: values.contract_value,
        status: values.status,
      });
    },
    onSuccess: async (chantier) => {
      await queryClient.invalidateQueries({ queryKey: ['chantiers'] });
      toast.success('Chantier créé');
      navigate(`/chantiers/${chantier.id}`);
    },
    onError: (err) => toast.fromError(err, 'Échec de la création'),
  });

  const update = useMutation({
    mutationFn: (values: z.output<typeof FormSchema>) => {
      const soft =
        CHANTIER_COLOR_PALETTE.find((p) => p.color === values.color)?.soft ?? null;
      return updateChantier(id!, {
        name: values.name,
        type: blank(values.type),
        color: values.color,
        color_soft: soft,
        client_name: blank(values.client_name),
        manager_name: blank(values.manager_name),
        address: blank(values.address),
        date_start: blank(values.date_start),
        date_end_prev: blank(values.date_end_prev),
        budget_total: values.budget_total,
        budget_labor: values.budget_labor,
        budget_materials: values.budget_materials,
        budget_equipment: values.budget_equipment,
        contract_value: values.contract_value,
        status: values.status,
      });
    },
    onSuccess: async (chantier) => {
      await queryClient.invalidateQueries({ queryKey: ['chantiers'] });
      await queryClient.invalidateQueries({ queryKey: ['chantier', id] });
      toast.success('Chantier mis à jour');
      navigate(`/chantiers/${chantier.id}`);
    },
    onError: (err) => toast.fromError(err, 'Échec de la mise à jour'),
  });

  // RHF gives us the input-typed values; zodResolver guarantees they've been
  // validated and parsed by the time we get here, so we cast to the output type.
  const onSubmit = form.handleSubmit((values) => {
    const parsed = FormSchema.parse(values);
    if (isNew) create.mutate(parsed);
    else update.mutate(parsed);
  });

  const pending = create.isPending || update.isPending;

  if (!isNew && existing.isLoading) {
    return <div className="text-sm text-bati-muted">Chargement du chantier…</div>;
  }

  if (!isNew && existing.isError) {
    return (
      <div className="bati-card rounded-lg p-6 max-w-md">
        <h2 className="text-base font-bold text-bati-terra">Chantier introuvable</h2>
        <p className="text-sm text-bati-muted mt-2">
          {existing.error instanceof Error
            ? existing.error.message
            : 'Une erreur est survenue.'}
        </p>
        <Link
          to="/chantiers"
          className="mt-4 inline-block text-sm text-bati-teal hover:underline"
        >
          Retour à la liste
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link
          to="/chantiers"
          className="text-xs text-bati-muted hover:text-bati-text inline-flex items-center gap-1"
        >
          <span aria-hidden>←</span> Retour aux chantiers
        </Link>
        <h1 className="text-2xl font-bold text-bati-text mt-2">
          {isNew ? 'Nouveau chantier' : `Modifier — ${form.watch('name') || ''}`}
        </h1>
      </div>

      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <Section title="Identité">
          <Field label="Nom" error={form.formState.errors.name?.message} required>
            <input
              type="text"
              className="bati-input"
              {...form.register('name')}
              autoFocus={isNew}
            />
          </Field>
          <Field label="Type" hint="Ex : gros œuvre, finition, voirie…">
            <input type="text" className="bati-input" {...form.register('type')} />
          </Field>
          <Field label="Couleur d'identification">
            <div className="flex flex-wrap gap-2">
              {CHANTIER_COLOR_PALETTE.map((p) => {
                const selected = form.watch('color') === p.color;
                return (
                  <button
                    type="button"
                    key={p.color}
                    onClick={() => form.setValue('color', p.color)}
                    aria-label={p.label}
                    aria-pressed={selected}
                    className={`w-8 h-8 rounded-full transition-all ${
                      selected ? 'ring-2 ring-offset-2 ring-bati-text' : ''
                    }`}
                    style={{ background: p.color }}
                  />
                );
              })}
            </div>
          </Field>
        </Section>

        <Section title="Client & responsable">
          <Field label="Client">
            <input
              type="text"
              className="bati-input"
              {...form.register('client_name')}
            />
          </Field>
          <Field
            label="Chef de chantier"
            hint="Nom libre — l'assignation aux comptes utilisateurs arrive plus tard."
          >
            <input
              type="text"
              className="bati-input"
              {...form.register('manager_name')}
            />
          </Field>
          <Field label="Adresse">
            <input type="text" className="bati-input" {...form.register('address')} />
          </Field>
        </Section>

        <Section title="Dates">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Début" error={form.formState.errors.date_start?.message}>
              <input type="date" className="bati-input" {...form.register('date_start')} />
            </Field>
            <Field
              label="Fin prévue"
              error={form.formState.errors.date_end_prev?.message}
            >
              <input
                type="date"
                className="bati-input"
                {...form.register('date_end_prev')}
              />
            </Field>
          </div>
        </Section>

        <Section title="Budget">
          <p className="text-xs text-bati-muted mb-2">
            Les montants sont en MAD. Le total inclut une enveloppe « divers » non
            répartie ; main d&apos;œuvre + matériaux + matériels doivent rester ≤ total.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label="Budget total"
              error={form.formState.errors.budget_total?.message}
              required
            >
              <input
                type="number"
                step="0.01"
                min="0"
                className="bati-input"
                {...form.register('budget_total')}
              />
            </Field>
            <Field
              label="Valeur du contrat"
              hint="Montant facturé au client."
              error={form.formState.errors.contract_value?.message}
            >
              <input
                type="number"
                step="0.01"
                min="0"
                className="bati-input"
                {...form.register('contract_value')}
              />
            </Field>
            <Field
              label="Budget main d'œuvre"
              error={form.formState.errors.budget_labor?.message}
            >
              <input
                type="number"
                step="0.01"
                min="0"
                className="bati-input"
                {...form.register('budget_labor')}
              />
            </Field>
            <Field
              label="Budget matériaux"
              error={form.formState.errors.budget_materials?.message}
            >
              <input
                type="number"
                step="0.01"
                min="0"
                className="bati-input"
                {...form.register('budget_materials')}
              />
            </Field>
            <Field
              label="Budget matériels"
              hint="Location & usage d'équipements (bétonnière, échafaudage, etc.)."
              error={form.formState.errors.budget_equipment?.message}
            >
              <input
                type="number"
                step="0.01"
                min="0"
                className="bati-input"
                {...form.register('budget_equipment')}
              />
            </Field>
          </div>
        </Section>

        <Section title="Statut">
          <div className="flex flex-wrap gap-2">
            {STATUS.map((s) => {
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
                  {CHANTIER_STATUS_LABEL[s]}
                </button>
              );
            })}
          </div>
        </Section>

        <div className="flex justify-end gap-2 pt-2">
          <Link
            to={isNew ? '/chantiers' : `/chantiers/${id}`}
            className="px-4 py-2 text-sm font-medium text-bati-text hover:bg-bati-border-soft rounded-md"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="px-5 py-2 bg-bati-teal text-white rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {pending ? 'Enregistrement…' : isNew ? 'Créer le chantier' : 'Enregistrer'}
          </button>
        </div>
      </form>
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
