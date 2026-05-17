-- BatiTrack — Migration 0004 — Planning: tasks RPCs
--
-- Adds:
--   • create_task_with_assignments — atomic task + worker assignments
--   • update_task_with_assignments — atomic task update + diff-apply on
--                                    assignments (delete removed, insert added)
--
-- Both follow the same pattern as create_purchase_with_lines (migration 0003):
-- security_definer, role-gated, JSONB-input, returns the new/updated row.

-- ─── create_task_with_assignments(p_input jsonb) ─────────────────────────
--
-- Input shape:
--   {
--     "org_id":         "...",
--     "chantier_id":    "...",
--     "parent_task_id": "..." | null,
--     "label":          "...",
--     "start_date":     "YYYY-MM-DD" | null,
--     "duration_days":  3 | null,
--     "status":         "todo" | "ongoing" | "done" | "critical",
--     "sort_order":     0,
--     "assignee_worker_ids": ["uuid", ...]
--   }

create or replace function public.create_task_with_assignments(p_input jsonb)
returns public.tasks
language plpgsql security definer set search_path = public, app as $$
declare
  v_org   uuid := (p_input ->> 'org_id')::uuid;
  v_role  public.org_role;
  v_task  public.tasks;
  v_wid   uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '42501';
  end if;

  v_role := app.user_role_in_org(v_org);
  if v_role not in ('owner', 'admin', 'site_manager') then
    raise exception 'Access denied: caller cannot create tasks in this org'
      using errcode = '42501';
  end if;

  if nullif(p_input ->> 'chantier_id', '') is null then
    raise exception 'chantier_id is required' using errcode = '23502';
  end if;
  if nullif(p_input ->> 'label', '') is null then
    raise exception 'label is required' using errcode = '23502';
  end if;

  insert into public.tasks (
    org_id, chantier_id, parent_task_id, label,
    start_date, duration_days, status, sort_order
  ) values (
    v_org,
    (p_input ->> 'chantier_id')::uuid,
    nullif(p_input ->> 'parent_task_id', '')::uuid,
    p_input ->> 'label',
    nullif(p_input ->> 'start_date', '')::date,
    nullif(p_input ->> 'duration_days', '')::integer,
    coalesce(p_input ->> 'status', 'todo')::public.task_lifecycle,
    coalesce((p_input ->> 'sort_order')::integer, 0)
  )
  returning * into v_task;

  if p_input ? 'assignee_worker_ids' then
    for v_wid in
      select (value #>> '{}')::uuid from jsonb_array_elements(p_input -> 'assignee_worker_ids')
    loop
      insert into public.task_assignments (org_id, task_id, worker_id)
      values (v_org, v_task.id, v_wid)
      on conflict (task_id, worker_id) do nothing;
    end loop;
  end if;

  return v_task;
end;
$$;

revoke execute on function public.create_task_with_assignments(jsonb) from public;
grant  execute on function public.create_task_with_assignments(jsonb) to authenticated;

-- ─── update_task_with_assignments(p_task_id, p_input jsonb) ─────────────
--
-- Input shape: same keys as create, but every field is optional. If
-- `assignee_worker_ids` is present, the assignment set is replaced (diff and
-- apply); if absent, assignments are left alone.

create or replace function public.update_task_with_assignments(
  p_task_id uuid,
  p_input   jsonb
)
returns public.tasks
language plpgsql security definer set search_path = public, app as $$
declare
  v_task        public.tasks;
  v_role        public.org_role;
  v_existing    uuid[];
  v_target      uuid[];
  v_to_add      uuid[];
  v_to_remove   uuid[];
  v_wid         uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated' using errcode = '42501';
  end if;

  select * into v_task from public.tasks where id = p_task_id and deleted_at is null;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  v_role := app.user_role_in_org(v_task.org_id);
  if v_role not in ('owner', 'admin', 'site_manager') then
    raise exception 'Access denied: caller cannot edit tasks in this org'
      using errcode = '42501';
  end if;

  -- Site-managers may only edit tasks on chantiers they are assigned to.
  if v_role = 'site_manager' and not app.user_has_chantier(v_task.chantier_id) then
    raise exception 'Access denied: chantier not in caller scope'
      using errcode = '42501';
  end if;

  update public.tasks set
    label          = coalesce(nullif(p_input ->> 'label', ''),            label),
    parent_task_id = case
                       when p_input ? 'parent_task_id'
                       then nullif(p_input ->> 'parent_task_id', '')::uuid
                       else parent_task_id
                     end,
    start_date     = case
                       when p_input ? 'start_date'
                       then nullif(p_input ->> 'start_date', '')::date
                       else start_date
                     end,
    duration_days  = case
                       when p_input ? 'duration_days'
                       then nullif(p_input ->> 'duration_days', '')::integer
                       else duration_days
                     end,
    status         = coalesce(
                       (nullif(p_input ->> 'status', ''))::public.task_lifecycle,
                       status
                     ),
    sort_order     = coalesce((p_input ->> 'sort_order')::integer, sort_order),
    updated_at     = now()
  where id = p_task_id
  returning * into v_task;

  -- Diff-apply assignments only when the key is present in the payload.
  if p_input ? 'assignee_worker_ids' then
    select array_agg(worker_id)
      into v_existing
      from public.task_assignments
      where task_id = p_task_id;
    v_existing := coalesce(v_existing, array[]::uuid[]);

    select array_agg((value #>> '{}')::uuid)
      into v_target
      from jsonb_array_elements(p_input -> 'assignee_worker_ids');
    v_target := coalesce(v_target, array[]::uuid[]);

    v_to_add    := array(select unnest(v_target)   except select unnest(v_existing));
    v_to_remove := array(select unnest(v_existing) except select unnest(v_target));

    foreach v_wid in array v_to_add loop
      insert into public.task_assignments (org_id, task_id, worker_id)
      values (v_task.org_id, p_task_id, v_wid)
      on conflict (task_id, worker_id) do nothing;
    end loop;

    if array_length(v_to_remove, 1) > 0 then
      delete from public.task_assignments
      where task_id = p_task_id
        and worker_id = any(v_to_remove);
    end if;
  end if;

  return v_task;
end;
$$;

revoke execute on function public.update_task_with_assignments(uuid, jsonb) from public;
grant  execute on function public.update_task_with_assignments(uuid, jsonb) to authenticated;
