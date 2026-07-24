begin;

create or replace function public.normalize_report_type(p_value text)
returns public.inventory_report_type
language plpgsql
immutable
set search_path = ''
as $$
begin
  case lower(btrim(p_value))
    when 'stocks' then return 'stocks'::public.inventory_report_type;
    when 'scanresults' then return 'sold_out'::public.inventory_report_type;
    when 'sold_out' then return 'sold_out'::public.inventory_report_type;
    when 'sold out' then return 'sold_out'::public.inventory_report_type;
    when 'audit' then return 'audit'::public.inventory_report_type;
    when 're_inventory' then return 'audit'::public.inventory_report_type;
    when 're-inventory' then return 'audit'::public.inventory_report_type;
    when 're inventory' then return 'audit'::public.inventory_report_type;
    else
      raise exception 'Unsupported report type: %', p_value using errcode = '22023';
  end case;
end;
$$;

create or replace function public.inventory_page(
  p_branch_code text default null,
  p_report_type text default 'stocks',
  p_search text default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_report public.inventory_report_type;
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_total bigint;
  v_items jsonb;
begin
  if not public.current_user_is_active() then
    raise exception 'Active account required' using errcode = '42501';
  end if;
  v_report := public.normalize_report_type(p_report_type);

  with matching as (
    select i.*
    from public.inventory_items i
    join public.branches b on b.id = i.branch_id
    where i.deleted_at is null
      and i.report_type = v_report
      and public.can_access_branch(i.branch_id)
      and (
        p_branch_code is null
        or btrim(p_branch_code) = ''
        or upper(btrim(p_branch_code)) = 'ALL'
        or b.code = upper(btrim(p_branch_code))
      )
      and (
        p_search is null
        or btrim(p_search) = ''
        or coalesce(i.tag, '') ilike '%' || btrim(p_search) || '%'
        or coalesce(i.si, '') ilike '%' || btrim(p_search) || '%'
        or i.description ilike '%' || btrim(p_search) || '%'
      )
  )
  select count(*) into v_total from matching;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc, q.id), '[]'::jsonb)
  into v_items
  from (
    select
      i.id,
      b.code as branch_code,
      b.name as branch_name,
      i.report_type,
      i.lens_type,
      i.description,
      i.tag,
      i.si,
      i.inventory_date,
      i.created_at,
      i.updated_at
    from public.inventory_items i
    join public.branches b on b.id = i.branch_id
    where i.deleted_at is null
      and i.report_type = v_report
      and public.can_access_branch(i.branch_id)
      and (
        p_branch_code is null
        or btrim(p_branch_code) = ''
        or upper(btrim(p_branch_code)) = 'ALL'
        or b.code = upper(btrim(p_branch_code))
      )
      and (
        p_search is null
        or btrim(p_search) = ''
        or coalesce(i.tag, '') ilike '%' || btrim(p_search) || '%'
        or coalesce(i.si, '') ilike '%' || btrim(p_search) || '%'
        or i.description ilike '%' || btrim(p_search) || '%'
      )
    order by i.created_at desc, i.id
    limit v_page_size
    offset (v_page - 1) * v_page_size
  ) q;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', v_page,
    'pageSize', v_page_size,
    'pageCount', case when v_total = 0 then 0 else ceil(v_total::numeric / v_page_size)::integer end
  );
end;
$$;

create or replace function public.inventory_summary(
  p_branch_code text default null,
  p_search text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_available bigint;
  v_sold_out bigint;
  v_audited bigint;
begin
  if not public.current_user_is_active() then
    raise exception 'Active account required' using errcode = '42501';
  end if;

  select
    count(*) filter (where i.report_type = 'stocks'::public.inventory_report_type),
    count(*) filter (where i.report_type = 'sold_out'::public.inventory_report_type),
    count(*) filter (where i.report_type = 'audit'::public.inventory_report_type)
  into v_available, v_sold_out, v_audited
  from public.inventory_items i
  join public.branches b on b.id = i.branch_id
  where i.deleted_at is null
    and public.can_access_branch(i.branch_id)
    and (
      p_branch_code is null
      or btrim(p_branch_code) = ''
      or upper(btrim(p_branch_code)) = 'ALL'
      or b.code = upper(btrim(p_branch_code))
    )
    and (
      p_search is null
      or btrim(p_search) = ''
      or coalesce(i.tag, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(i.si, '') ilike '%' || btrim(p_search) || '%'
      or i.description ilike '%' || btrim(p_search) || '%'
    );

  return jsonb_build_object(
    'available', v_available,
    'soldOut', v_sold_out,
    'audited', v_audited,
    'showing', v_available + v_sold_out + v_audited
  );
end;
$$;

create or replace function public.update_inventory_si(p_item_id uuid, p_si text)
returns public.inventory_items
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item public.inventory_items;
begin
  if length(coalesce(p_si, '')) > 120 then
    raise exception 'SI must not exceed 120 characters' using errcode = '22023';
  end if;

  update public.inventory_items
  set si = nullif(btrim(p_si), '')
  where id = p_item_id
    and deleted_at is null
    and report_type = 'sold_out'::public.inventory_report_type
  returning * into v_item;

  if not found then
    raise exception 'Sold Out inventory item was not found or is not editable'
      using errcode = 'P0002';
  end if;
  return v_item;
end;
$$;

create or replace function public.archive_inventory_item(p_item_id uuid)
returns public.inventory_items
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item public.inventory_items;
begin
  if not public.current_user_has_role(array['admin'::public.app_role]) then
    raise exception 'Administrator role required' using errcode = '42501';
  end if;

  update public.inventory_items
  set deleted_at = now(), deleted_by = auth.uid()
  where id = p_item_id and deleted_at is null
  returning * into v_item;

  if not found then
    raise exception 'Inventory item was not found' using errcode = 'P0002';
  end if;
  return v_item;
end;
$$;

revoke all on function public.normalize_report_type(text) from public;
revoke all on function public.inventory_page(text, text, text, integer, integer) from public;
revoke all on function public.inventory_summary(text, text) from public;
revoke all on function public.update_inventory_si(uuid, text) from public;
revoke all on function public.archive_inventory_item(uuid) from public;
grant execute on function public.normalize_report_type(text) to authenticated, service_role;
grant execute on function public.inventory_page(text, text, text, integer, integer) to authenticated;
grant execute on function public.inventory_summary(text, text) to authenticated;
grant execute on function public.update_inventory_si(uuid, text) to authenticated;
grant execute on function public.archive_inventory_item(uuid) to authenticated;

commit;
