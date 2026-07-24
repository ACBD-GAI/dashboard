begin;

create or replace function public.apply_inventory_import(
  p_job_id uuid,
  p_actor_id uuid,
  p_branch_id uuid,
  p_strategy public.import_strategy,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role public.app_role;
  v_batch_id uuid;
  v_source_sha text;
  v_row jsonb;
  v_existing_id uuid;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_archived integer := 0;
  v_skipped integer := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Rows must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 10000 then
    raise exception 'An import may contain at most 10000 valid rows' using errcode = '22023';
  end if;

  select p.role into v_actor_role
  from public.profiles p
  where p.id = p_actor_id and p.active;

  if v_actor_role <> 'admin'::public.app_role then
    raise exception 'Import permission denied' using errcode = '42501';
  end if;

  select source_sha256 into v_source_sha
  from public.import_jobs
  where id = p_job_id
    and requested_by = p_actor_id
    and branch_id = p_branch_id
    and status = 'running'::public.job_status
  for update;

  if not found or v_source_sha is null then
    raise exception 'Running import job with source digest was not found' using errcode = 'P0002';
  end if;

  insert into public.import_batches (
    job_id, branch_id, source_sha256, strategy, created_by
  )
  values (p_job_id, p_branch_id, v_source_sha, p_strategy, p_actor_id)
  returning id into v_batch_id;

  if p_strategy = 'replace'::public.import_strategy and jsonb_array_length(p_rows) > 0 then
    with report_types as (
      select distinct public.normalize_report_type(value ->> 'report_type') as report_type
      from jsonb_array_elements(p_rows)
    )
    update public.inventory_items i
    set deleted_at = now(), deleted_by = p_actor_id, updated_by = p_actor_id
    where i.branch_id = p_branch_id
      and i.deleted_at is null
      and i.report_type in (select report_type from report_types);
    get diagnostics v_archived = row_count;
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_existing_id := null;

    if p_strategy = 'upsert'::public.import_strategy
       and nullif(btrim(v_row ->> 'external_key'), '') is not null then
      select i.id into v_existing_id
      from public.inventory_items i
      where i.branch_id = p_branch_id
        and i.report_type = public.normalize_report_type(v_row ->> 'report_type')
        and i.external_key = nullif(btrim(v_row ->> 'external_key'), '')
        and i.deleted_at is null
      order by i.created_at desc
      limit 1
      for update;
    end if;

    if v_existing_id is not null then
      update public.inventory_items
      set
        lens_type = nullif(btrim(v_row ->> 'lens_type'), ''),
        description = btrim(v_row ->> 'description'),
        tag = nullif(btrim(v_row ->> 'tag'), ''),
        si = nullif(btrim(v_row ->> 'si'), ''),
        inventory_date = nullif(v_row ->> 'inventory_date', '')::date,
        source_row_number = (v_row ->> 'source_row_number')::integer,
        source_metadata = coalesce(v_row -> 'source_metadata', '{}'::jsonb),
        import_batch_id = v_batch_id,
        updated_by = p_actor_id
      where id = v_existing_id;
      v_updated := v_updated + 1;
    else
      insert into public.inventory_items (
        branch_id,
        report_type,
        lens_type,
        description,
        tag,
        si,
        inventory_date,
        external_key,
        source_row_number,
        source_metadata,
        import_batch_id,
        created_by,
        updated_by
      )
      values (
        p_branch_id,
        public.normalize_report_type(v_row ->> 'report_type'),
        nullif(btrim(v_row ->> 'lens_type'), ''),
        btrim(v_row ->> 'description'),
        nullif(btrim(v_row ->> 'tag'), ''),
        nullif(btrim(v_row ->> 'si'), ''),
        nullif(v_row ->> 'inventory_date', '')::date,
        nullif(btrim(v_row ->> 'external_key'), ''),
        (v_row ->> 'source_row_number')::integer,
        coalesce(v_row -> 'source_metadata', '{}'::jsonb),
        v_batch_id,
        p_actor_id,
        p_actor_id
      );
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  update public.import_batches
  set rows_applied = v_inserted + v_updated
  where id = v_batch_id;

  insert into public.audit_events (
    actor_id, action, target_table, target_id, branch_id, after_state, metadata
  )
  values (
    p_actor_id,
    'inventory.import',
    'import_batches',
    v_batch_id::text,
    p_branch_id,
    jsonb_build_object(
      'inserted', v_inserted,
      'updated', v_updated,
      'archived', v_archived,
      'strategy', p_strategy
    ),
    jsonb_build_object('jobId', p_job_id, 'sourceSha256', v_source_sha)
  );

  return jsonb_build_object(
    'batchId', v_batch_id,
    'inserted', v_inserted,
    'updated', v_updated,
    'archived', v_archived,
    'skipped', v_skipped
  );
end;
$$;

create or replace function public.clear_inventory_report(
  p_actor_id uuid,
  p_branch_id uuid,
  p_report_type public.inventory_report_type
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_event_id bigint;
  v_cleared_at timestamptz := now();
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and active and role = 'admin'::public.app_role
  ) then
    raise exception 'Administrator role required' using errcode = '42501';
  end if;

  update public.inventory_items
  set
    deleted_at = v_cleared_at,
    deleted_by = p_actor_id,
    updated_by = p_actor_id
  where branch_id = p_branch_id
    and report_type = p_report_type
    and deleted_at is null;
  get diagnostics v_count = row_count;

  insert into public.audit_events (
    actor_id, action, target_table, branch_id, after_state, metadata
  )
  values (
    p_actor_id,
    'inventory.clear_report',
    'inventory_items',
    p_branch_id,
    jsonb_build_object(
      'reportType', p_report_type,
      'affectedRows', v_count,
      'clearedAt', v_cleared_at
    ),
    jsonb_build_object(
      'recovery', 'Restore rows matching branch_id, report_type, deleted_by, and deleted_at'
    )
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'affectedRows', v_count,
    'auditEventId', v_event_id,
    'clearedAt', v_cleared_at
  );
end;
$$;

revoke all on function public.apply_inventory_import(
  uuid, uuid, uuid, public.import_strategy, jsonb
) from public, anon, authenticated;
revoke all on function public.clear_inventory_report(
  uuid, uuid, public.inventory_report_type
) from public, anon, authenticated;
grant execute on function public.apply_inventory_import(
  uuid, uuid, uuid, public.import_strategy, jsonb
) to service_role;
grant execute on function public.clear_inventory_report(
  uuid, uuid, public.inventory_report_type
) to service_role;

commit;
