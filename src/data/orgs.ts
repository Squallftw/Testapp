import { getSupabase } from './client';
import { mapSupabaseError, NotFoundError } from './errors';

// Placeholder types — replace with Database['public']['Tables']['…']['Row']
// after `npm run gen:types`.

export type OrgRole = 'owner' | 'admin' | 'site_manager' | 'worker';
export type MemberStatus = 'invited' | 'active' | 'revoked';

export interface Organization {
  id: string;
  name: string;
  legal_name: string | null;
  ice: string | null;
  rc: string | null;
  cnss: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  plan: string;
  currency: string;
  locale: string;
  timezone: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Membership {
  id: string;
  user_id: string;
  org_id: string;
  role: OrgRole;
  status: MemberStatus;
  invited_at: string;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateOrgInput {
  name: string;
  legal_name?: string;
  ice?: string;
  rc?: string;
  cnss?: string;
  address?: string;
  phone?: string;
  email?: string;
}

export interface InviteMemberInput {
  email: string;
  role: OrgRole;
  /** Chantier IDs to scope a site_manager to. Ignored for owner/admin/worker. */
  chantierIds?: string[];
}

/** An org paired with the current user's role inside it. */
export interface OrgWithRole {
  organization: Organization;
  role: OrgRole;
}

// ── implemented (Gate 5 auth port) ───────────────────────────────────

/**
 * All orgs the current user is an active member of, with their role in each.
 * Returned in a stable shape so consumers can render role-aware UI without
 * a second query.
 */
export async function listMyOrgs(): Promise<OrgWithRole[]> {
  const supabase = getSupabase();
  // RLS `memberships_select_self` restricts to the caller's own memberships.
  // The joined `organizations` rows are visible because the caller is a member.
  const { data, error } = await supabase
    .from('memberships')
    .select('role, organization:organizations(*)')
    .eq('status', 'active')
    .is('deleted_at', null);

  if (error) throw mapSupabaseError(error);

  // PostgREST returns the FK join as a single object (memberships.org_id → organizations.id),
  // but the untyped client widens to any[]. Cast through unknown until database.types.ts lands.
  type Row = { role: OrgRole; organization: Organization | null };
  return (data ?? [])
    .map((row) => row as unknown as Row)
    .filter(
      (row): row is { role: OrgRole; organization: Organization } =>
        row.organization !== null && row.organization.deleted_at === null
    )
    .map((row) => ({ organization: row.organization, role: row.role }));
}

/**
 * Create a new org. The caller becomes the first owner-member atomically
 * via the `app.create_organization_with_owner` SECURITY DEFINER RPC.
 */
export async function createOrg(input: CreateOrgInput): Promise<Organization> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('create_organization_with_owner', {
    p_input: input as unknown as Record<string, unknown>,
  });

  if (error) throw mapSupabaseError(error);
  if (!data) throw new NotFoundError('Org creation returned no data');
  return data as Organization;
}

// ── M1a: org settings + members ──────────────────────────────────────

/** Detail row returned by the list_org_members RPC (joins email). */
export interface MemberDetail {
  membership_id: string;
  user_id: string;
  email: string;
  role: OrgRole;
  status: MemberStatus;
  invited_at: string;
  accepted_at: string | null;
  created_at: string;
}

export async function getOrg(orgId: string): Promise<Organization> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) throw new NotFoundError(`Organisation ${orgId} introuvable`);
  return data as unknown as Organization;
}

export async function updateOrg(
  orgId: string,
  input: Partial<CreateOrgInput>
): Promise<Organization> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('organizations')
    .update(input)
    .eq('id', orgId)
    .is('deleted_at', null)
    .select('*')
    .single();
  if (error) throw mapSupabaseError(error);
  return data as unknown as Organization;
}

export async function listMembers(orgId: string): Promise<MemberDetail[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('list_org_members', {
    p_org_id: orgId,
  });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as MemberDetail[];
}

export async function inviteMember(
  orgId: string,
  input: InviteMemberInput
): Promise<Membership> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('invite_member_by_email', {
    p_org_id: orgId,
    p_email: input.email,
    p_role: input.role,
    p_chantier_ids: input.chantierIds ?? null,
  });
  if (error) throw mapSupabaseError(error);
  if (!data) throw new NotFoundError('Invitation a échoué');
  return data as unknown as Membership;
}

/** Pending invite shape from list_my_pending_invites RPC. */
export interface PendingInvite {
  membership_id: string;
  org_id: string;
  org_name: string;
  role: OrgRole;
  invited_at: string;
}

export async function listMyPendingInvites(): Promise<PendingInvite[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('list_my_pending_invites');
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as PendingInvite[];
}

export async function acceptInvite(membershipId: string): Promise<Membership> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('accept_my_invitation', {
    p_membership_id: membershipId,
  });
  if (error) throw mapSupabaseError(error);
  if (!data) throw new NotFoundError("Invitation introuvable");
  return data as unknown as Membership;
}

export async function updateMemberRole(
  membershipId: string,
  role: OrgRole
): Promise<Membership> {
  const supabase = getSupabase();
  // Last-owner protection is enforced server-side by app.protect_last_owner
  // trigger — we just surface any 23514 it raises via mapSupabaseError.
  const { data, error } = await supabase
    .from('memberships')
    .update({ role })
    .eq('id', membershipId)
    .is('deleted_at', null)
    .select('*')
    .single();
  if (error) throw mapSupabaseError(error);
  return data as unknown as Membership;
}

/** Revoke = soft-archive the membership. The user loses access immediately. */
export async function revokeMember(membershipId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('memberships')
    .update({ status: 'revoked', deleted_at: new Date().toISOString() })
    .eq('id', membershipId)
    .is('deleted_at', null);
  if (error) throw mapSupabaseError(error);
}

export const ORG_ROLE_LABEL: Record<OrgRole, string> = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
  site_manager: 'Chef de chantier',
  worker: 'Ouvrier',
};

export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  invited: 'Invité',
  active: 'Actif',
  revoked: 'Révoqué',
};
