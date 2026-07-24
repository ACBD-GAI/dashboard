begin;

create or replace function public.admin_update_user(
  p_user_id uuid,
  p_role text,
  p_active boolean,
  p_branch_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
  v_before jsonb;
  v_after jsonb;
  v_branch_ids uuid[] := coalesce(p_branch_ids, array[]::uuid[]);
begin
  if not public.current_user_has_role(array['admin'::public.app_role]) then
    raise exception 'Administrator role required' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Use another administrator to change your own role or active status'
      using errcode = '42501';
  end if;

  begin
    v_role := lower(btrim(p_role))::public.app_role;
  exception when invalid_text_representation then
    raise exception 'Role must be admin, staff, or viewer' using errcode = '22023';
  end;

  if exists (
    select 1 from unnest(v_branch_ids) requested(id)
    left join public.branches b on b.id = requested.id and b.active
    where b.id is null
  ) then
    raise exception 'One or more branch IDs are invalid or inactive' using errcode = '22023';
  end if;

  select to_jsonb(p) into v_before
  from public.profiles p where p.id = p_user_id for update;
  if v_before is null then
    raise exception 'User profile was not found' using errcode = 'P0002';
  end if;

  update public.profiles
  set role = v_role, active = p_active
  where id = p_user_id
  returning to_jsonb(profiles.*) into v_after;

  delete from public.user_branch_access where user_id = p_user_id;
  insert into public.user_branch_access (user_id, branch_id, created_by)
  select p_user_id, branch_id, auth.uid()
  from unnest(v_branch_ids) branch_id
  on conflict do nothing;

  insert into public.audit_events (
    actor_id, action, target_table, target_id, before_state, after_state, metadata
  )
  values (
    auth.uid(),
    'user.authorization_update',
    'profiles',
    p_user_id::text,
    v_before,
    v_after,
    jsonb_build_object('branchIds', to_jsonb(v_branch_ids))
  );

  return jsonb_build_object(
    'profile', v_after,
    'branchIds', to_jsonb(v_branch_ids)
  );
end;
$$;

revoke all on function public.admin_update_user(uuid, text, boolean, uuid[])
from public, anon;
grant execute on function public.admin_update_user(uuid, text, boolean, uuid[])
to authenticated;

commit;
