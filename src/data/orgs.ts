import { getSupabase } from './client';
import { mapSupabaseError, NotFoundError, todo } from './errors';

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

// ── implemented (Gate 5 auth port) ───────────────────────────────────

/** All orgs the current user is an active member of. */
export async function listMyOrgs(): Promise<Organization[]> {
  const supabase = getSupabase();
  // RLS `memberships_select_self` restricts to the caller's own memberships.
  // The joined `organizations` rows are visible because the caller is a member.
  const { data, error } = await supabase
    .from('memberships')
    .select('organization:organizations(*)')
    .eq('status', 'active')
    .is('deleted_at', null);

  if (error) throw mapSupabaseError(error);

  // PostgREST returns the FK join as a single object (memberships.org_id → organizations.id),
  // but the untyped client widens to any[]. Cast through unknown until database.types.ts lands.
  return (data ?? [])
    .map(
      (row) => (row as unknown as { organization: Organization | null }).organization
    )
    .filter((org): org is Organization => org !== null && org.deleted_at === null);
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

// ── stubs (next feature port: org/membership UI) ──────────────────────

export async function getOrg(orgId: string): Promise<Organization> {
  return todo('orgs.getOrg', orgId);
}

export async function updateOrg(
  orgId: string,
  input: Partial<CreateOrgInput>
): Promise<Organization> {
  return todo('orgs.updateOrg', orgId, input);
}

export async function softDeleteOrg(orgId: string): Promise<void> {
  return todo('orgs.softDeleteOrg', orgId);
}

export async function listMembers(orgId: string): Promise<Membership[]> {
  return todo('orgs.listMembers', orgId);
}

export async function inviteMember(
  orgId: string,
  input: InviteMemberInput
): Promise<Membership> {
  return todo('orgs.inviteMember', orgId, input);
}

export async function acceptInvite(membershipId: string): Promise<Membership> {
  return todo('orgs.acceptInvite', membershipId);
}

export async function revokeMember(membershipId: string): Promise<void> {
  return todo('orgs.revokeMember', membershipId);
}

export async function updateMemberRole(
  membershipId: string,
  role: OrgRole
): Promise<Membership> {
  return todo('orgs.updateMemberRole', membershipId, role);
}
