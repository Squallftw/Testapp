-- BatiTrack — Migration 0002 — Org/member management RPCs + last-owner trigger
--
-- Adds the server-side primitives M1a relies on:
--   • list_org_members(p_org_id)        — JOINs memberships + auth.users.email
--   • invite_member_by_email(...)       — owner/admin can attach an existing
--                                         user to their org with status='invited'
--   • accept_my_invitation(p_id)        — invitee flips own status to 'active'
--   • app.protect_last_owner()          — trigger refusing to demote/revoke the
--                                         last remaining active owner
--
-- All RPCs live in `public` so PostgREST exposes them.

-- ─── 1. list_org_members(p_org_id) ────────────────────────────────────

create or replace function public.list_org_members(p_org_id uuid)
returns table (
  membership_id  uuid,
  user_id        uuid,
  email          text,
  role           public.org_role,
  status         public.member_status,
  invited_at     timestamptz,
  accepted_at    timestamptz,
  created_at     timestamptz
)
language plpgsql security definer set search_path = public, app, auth as $$
begin
  -- Caller must be owner/admin of the target org. RLS on memberships would
  -- enforce the same thing, but checking explicitly gives a cleaner error.
  if app.user_role_in_org(p_org_id) not in ('owner', 'admin') then
    raise exception 'Access denied: caller is not owner/admin of this org'
      using errcode = '42501';
  end if;

  return query
    select m.id, m.user_id, u.email::text, m.role, m.status,
           m.invited_at, m.accepted_at, m.created_at
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.org_id = p_org_id
      and m.deleted_at is null
    order by
      case m.role when 'owner' then 0 when 'admin' then 1
                  when 'site_manager' then 2 else 3 end,
      m.created_at;
end;
$$;

revoke execute on function public.list_org_members(uuid) from public;
grant  execute on function public.list_org_members(uuid) to authenticated;

-- ─── 2. invite_member_by_email(...) ───────────────────────────────────
--
-- Beta-friendly invite: requires the invitee to have already signed up
-- (we look them up in auth.users by email). For full self-service invites
-- with new-user creation, see the deferred `invite-member` Edge Function.

create or replace function public.invite_member_by_email(
  p_org_id        uuid,
  p_email         text,
  p_role          public.org_role,
  p_chantier_ids  uuid[] default null
)
returns public.memberships
language plpgsql security definer set search_path = public, app, auth as $$
declare
  v_caller        uuid := auth.uid();
  v_user          uuid;
  v_membership    public.memberships;
  v_chantier_id   uuid;
begin
  if v_caller is null then
    raise exception 'Must be authenticated' using errcode = '42501';
  end if;
  if app.user_role_in_org(p_org_id) not in ('owner', 'admin') then
    raise exception 'Access denied: caller is not owner/admin of this org'
      using errcode = '42501';
  end if;
  if p_role = 'owner' and app.user_role_in_org(p_org_id) <> 'owner' then
    raise exception 'Only an owner can grant the owner role'
      using errcode = '42501';
  end if;

  select id into v_user from auth.users where lower(email) = lower(p_email);
  if v_user is null then
    raise exception
      'Aucun compte trouvé pour %. Demandez à cette personne de créer un compte avant de l''ajouter.',
      p_email
      using errcode = 'P0002';
  end if;

  -- If the user already has a non-deleted membership in this org, refuse
  -- (would otherwise hit the partial unique index and surface a 23505).
  if exists (
    select 1 from public.memberships
    where user_id = v_user and org_id = p_org_id and deleted_at is null
  ) then
    raise exception 'Cette personne est déjà membre de cette organisation'
      using errcode = '23505';
  end if;

  insert into public.memberships (user_id, org_id, role, status, invited_at)
  values (v_user, p_org_id, p_role, 'invited', now())
  returning * into v_membership;

  if p_role = 'site_manager' and p_chantier_ids is not null then
    foreach v_chantier_id in array p_chantier_ids loop
      insert into public.chantier_assignments (membership_id, chantier_id)
      values (v_membership.id, v_chantier_id)
      on conflict do nothing;
    end loop;
  end if;

  return v_membership;
end;
$$;

revoke execute on function public.invite_member_by_email(uuid, text, public.org_role, uuid[]) from public;
grant  execute on function public.invite_member_by_email(uuid, text, public.org_role, uuid[]) to authenticated;

-- ─── 3. accept_my_invitation(p_membership_id) ─────────────────────────

create or replace function public.accept_my_invitation(p_membership_id uuid)
returns public.memberships
language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_row    public.memberships;
begin
  if v_caller is null then
    raise exception 'Must be authenticated' using errcode = '42501';
  end if;

  update public.memberships
     set status = 'active', accepted_at = coalesce(accepted_at, now())
   where id = p_membership_id
     and user_id = v_caller
     and status = 'invited'
     and deleted_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Invitation introuvable ou déjà acceptée'
      using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

revoke execute on function public.accept_my_invitation(uuid) from public;
grant  execute on function public.accept_my_invitation(uuid) to authenticated;

-- ─── 4. list_my_pending_invites() ─────────────────────────────────────
--
-- An invited user can SELECT their own membership row (per
-- memberships_select_self), but cannot see organizations.name because the
-- organizations_select policy only allows active members through. This RPC
-- bridges that gap so the onboarding screen can show « Vous avez été invité
-- à rejoindre <orgname> ».

create or replace function public.list_my_pending_invites()
returns table (
  membership_id  uuid,
  org_id         uuid,
  org_name       text,
  role           public.org_role,
  invited_at     timestamptz
)
language sql security definer set search_path = public as $$
  select m.id, m.org_id, o.name::text, m.role, m.invited_at
  from public.memberships m
  join public.organizations o on o.id = m.org_id
  where m.user_id = auth.uid()
    and m.status = 'invited'
    and m.deleted_at is null
    and o.deleted_at is null
  order by m.invited_at desc;
$$;

revoke execute on function public.list_my_pending_invites() from public;
grant  execute on function public.list_my_pending_invites() to authenticated;

-- ─── 5. Last-owner protection ─────────────────────────────────────────
--
-- An org with zero active owners is bricked: nobody can manage org settings
-- or grant new owner roles. Refuse any UPDATE/DELETE that would leave the
-- org in that state.

create or replace function app.protect_last_owner() returns trigger
language plpgsql as $$
declare
  v_org_id     uuid;
  v_remaining  integer;
begin
  -- Only act when the change could remove an owner.
  if tg_op = 'DELETE' then
    if old.role <> 'owner' or old.status <> 'active' then
      return old;
    end if;
    v_org_id := old.org_id;
  elsif tg_op = 'UPDATE' then
    if old.role <> 'owner' or old.status <> 'active' then
      return new;
    end if;
    -- Was an active owner. If still an active owner after the update, OK.
    if new.role = 'owner' and new.status = 'active' and new.deleted_at is null then
      return new;
    end if;
    v_org_id := old.org_id;
  else
    return new;
  end if;

  select count(*) into v_remaining
    from public.memberships
   where org_id = v_org_id
     and role = 'owner'
     and status = 'active'
     and deleted_at is null
     and id <> old.id;

  if v_remaining = 0 then
    raise exception
      'Impossible de retirer le dernier propriétaire actif. Promouvez un autre membre au rôle « owner » d''abord.'
      using errcode = '23514';  -- check_violation
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists trg_protect_last_owner on public.memberships;
create trigger trg_protect_last_owner
  before update or delete on public.memberships
  for each row execute function app.protect_last_owner();
