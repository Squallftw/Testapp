import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getOrg, updateOrg, type Organization } from '@/data/orgs';
import { useOrg } from '@/contexts/OrgContext';
import { toast } from '@/components/ui/Toast';

const FormSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est requis'),
  legal_name: z.string().trim(),
  ice: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{15}$/.test(v), 'ICE invalide (15 chiffres)'),
  rc: z.string().trim(),
  cnss: z.string().trim(),
  address: z.string().trim(),
  phone: z.string().trim(),
  email: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || z.string().email().safeParse(v).success,
      'Adresse email invalide'
    ),
});

type FormValues = z.input<typeof FormSchema>;

function orgToFormValues(o: Organization): FormValues {
  return {
    name: o.name,
    legal_name: o.legal_name ?? '',
    ice: o.ice ?? '',
    rc: o.rc ?? '',
    cnss: o.cnss ?? '',
    address: o.address ?? '',
    phone: o.phone ?? '',
    email: o.email ?? '',
  };
}

function blank(v: string): string | null {
  return v === '' ? null : v;
}

export default function OrgSettingsPage() {
  const { activeOrg, refresh } = useOrg();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['org', activeOrg?.id],
    queryFn: () => getOrg(activeOrg!.id),
    enabled: !!activeOrg,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: '',
      legal_name: '',
      ice: '',
      rc: '',
      cnss: '',
      address: '',
      phone: '',
      email: '',
    },
  });

  useEffect(() => {
    if (query.data) form.reset(orgToFormValues(query.data));
  }, [query.data, form]);

  const update = useMutation({
    mutationFn: (values: z.output<typeof FormSchema>) =>
      updateOrg(activeOrg!.id, {
        name: values.name,
        legal_name: blank(values.legal_name) ?? undefined,
        ice: blank(values.ice) ?? undefined,
        rc: blank(values.rc) ?? undefined,
        cnss: blank(values.cnss) ?? undefined,
        address: blank(values.address) ?? undefined,
        phone: blank(values.phone) ?? undefined,
        email: blank(values.email) ?? undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['org', activeOrg?.id] });
      await refresh();
      toast.success('Organisation mise à jour');
    },
    onError: (err) => toast.fromError(err, 'Échec de la mise à jour'),
  });

  const onSubmit = form.handleSubmit((values) =>
    update.mutate(FormSchema.parse(values))
  );

  if (query.isLoading) {
    return <div className="text-sm text-bati-muted">Chargement…</div>;
  }

  if (query.isError) {
    return (
      <div className="text-sm text-bati-terra">
        {query.error instanceof Error ? query.error.message : 'Erreur de chargement'}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-bati-text">Organisation</h1>
        <p className="text-sm text-bati-muted mt-1">
          Informations légales et coordonnées de votre entreprise.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <Section title="Identification">
          <Field label="Nom commercial" required error={form.formState.errors.name?.message}>
            <input type="text" className="bati-input" {...form.register('name')} />
          </Field>
          <Field label="Raison sociale">
            <input type="text" className="bati-input" {...form.register('legal_name')} />
          </Field>
        </Section>

        <Section title="Identifiants fiscaux">
          <Field
            label="ICE"
            hint="Identifiant Commun de l'Entreprise (15 chiffres)"
            error={form.formState.errors.ice?.message}
          >
            <input
              type="text"
              inputMode="numeric"
              className="bati-input"
              {...form.register('ice')}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="RC" hint="Registre du commerce">
              <input type="text" className="bati-input" {...form.register('rc')} />
            </Field>
            <Field label="CNSS" hint="Numéro d'affiliation CNSS">
              <input type="text" className="bati-input" {...form.register('cnss')} />
            </Field>
          </div>
        </Section>

        <Section title="Coordonnées">
          <Field label="Adresse">
            <input type="text" className="bati-input" {...form.register('address')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Téléphone">
              <input
                type="tel"
                className="bati-input"
                placeholder="+212 5XX XX XX XX"
                {...form.register('phone')}
              />
            </Field>
            <Field label="Email" error={form.formState.errors.email?.message}>
              <input type="email" className="bati-input" {...form.register('email')} />
            </Field>
          </div>
        </Section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={update.isPending || !form.formState.isDirty}
            className="px-5 py-2 bg-bati-teal text-white rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
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
