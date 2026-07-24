begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create type public.app_role as enum ('admin', 'staff', 'viewer');
create type public.inventory_report_type as enum ('stocks', 'sold_out', 'audit');
create type public.job_status as enum (
  'pending',
  'running',
  'completed',
  'completed_with_errors',
  'failed',
  'cancelled'
);
create type public.import_mode as enum ('preview', 'apply');
create type public.import_strategy as enum ('append', 'upsert', 'replace');

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9_-]{2,12}$'),
  name text not null check (length(btrim(name)) between 2 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role public.app_role not null default 'viewer',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_format check (position('@' in email) > 1)
);

create unique index profiles_email_lower_uidx on public.profiles (lower(email));

create table public.user_branch_access (
  user_id uuid not null references public.profiles(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  primary key (user_id, branch_id)
);

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  requested_by uuid not null references public.profiles(id),
  status public.job_status not null default 'pending',
  mode public.import_mode not null default 'preview',
  strategy public.import_strategy not null default 'upsert',
  source_bucket text not null default 'inventory-imports',
  source_path text not null,
  source_filename text not null,
  source_sha256 text,
  rows_read integer not null default 0 check (rows_read >= 0),
  rows_inserted integer not null default 0 check (rows_inserted >= 0),
  rows_updated integer not null default 0 check (rows_updated >= 0),
  rows_skipped integer not null default 0 check (rows_skipped >= 0),
  rows_rejected integer not null default 0 check (rows_rejected >= 0),
  row_errors jsonb not null default '[]'::jsonb check (jsonb_typeof(row_errors) = 'array'),
  error_report_path text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.import_jobs(id) on delete restrict,
  branch_id uuid not null references public.branches(id),
  source_sha256 text not null,
  strategy public.import_strategy not null,
  rows_applied integer not null default 0 check (rows_applied >= 0),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  report_type public.inventory_report_type not null,
  lens_type text,
  description text not null check (length(btrim(description)) between 1 and 500),
  tag text,
  si text,
  inventory_date date,
  external_key text,
  source_row_number integer check (source_row_number is null or source_row_number > 0),
  source_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(source_metadata) = 'object'),
  import_batch_id uuid references public.import_batches(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  constraint inventory_deleted_pair check (
    (deleted_at is null and deleted_by is null)
    or deleted_at is not null
  )
);

comment on table public.inventory_items is
  'Canonical inventory history. Legacy stocks, SCANRESULTS, and AUDIT map to stocks, sold_out, and audit. Rows are archived through deleted_at rather than physically deleted.';
comment on column public.inventory_items.external_key is
  'Optional source/business key used by the configurable upsert import strategy. It is intentionally not globally unique because legacy uniqueness is unconfirmed.';

create table public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  requested_by uuid not null references public.profiles(id),
  report_type public.inventory_report_type,
  status public.job_status not null default 'pending',
  destination_bucket text not null default 'inventory-exports',
  destination_path text,
  rows_exported integer not null default 0 check (rows_exported >= 0),
  error_message text,
  expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (length(btrim(action)) between 2 and 100),
  target_table text not null check (length(btrim(target_table)) between 2 and 100),
  target_id text,
  branch_id uuid references public.branches(id) on delete set null,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index user_branch_access_branch_idx on public.user_branch_access (branch_id, user_id);
create index inventory_branch_report_active_idx
  on public.inventory_items (branch_id, report_type, created_at desc)
  where deleted_at is null;
create index inventory_tag_trgm_idx
  on public.inventory_items using gin (tag extensions.gin_trgm_ops)
  where deleted_at is null;
create index inventory_si_trgm_idx
  on public.inventory_items using gin (si extensions.gin_trgm_ops)
  where deleted_at is null;
create index inventory_description_trgm_idx
  on public.inventory_items using gin (description extensions.gin_trgm_ops)
  where deleted_at is null;
create index inventory_external_key_idx
  on public.inventory_items (branch_id, report_type, external_key)
  where deleted_at is null and external_key is not null;
create index import_jobs_requester_idx on public.import_jobs (requested_by, created_at desc);
create index import_jobs_branch_status_idx on public.import_jobs (branch_id, status, created_at desc);
create index export_jobs_requester_idx on public.export_jobs (requested_by, created_at desc);
create index export_jobs_branch_status_idx on public.export_jobs (branch_id, status, created_at desc);
create index audit_events_actor_idx on public.audit_events (actor_id, created_at desc);
create index audit_events_branch_idx on public.audit_events (branch_id, created_at desc);
create index audit_events_target_idx on public.audit_events (target_table, target_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger branches_set_updated_at before update on public.branches
for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger inventory_items_set_updated_at before update on public.inventory_items
for each row execute function public.set_updated_at();
create trigger import_jobs_set_updated_at before update on public.import_jobs
for each row execute function public.set_updated_at();
create trigger export_jobs_set_updated_at before update on public.export_jobs
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, role, active)
  values (
    new.id,
    coalesce(new.email, new.id::text || '@invalid.local'),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''),
    'viewer'::public.app_role,
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active
  );
$$;

create or replace function public.current_user_has_role(p_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and p.role = any(p_roles)
  );
$$;

create or replace function public.can_access_branch(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    left join public.user_branch_access uba
      on uba.user_id = p.id and uba.branch_id = p_branch_id
    where p.id = auth.uid()
      and p.active
      and (p.role = 'admin'::public.app_role or uba.user_id is not null)
  );
$$;

create or replace function public.can_access_storage_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_owner_id uuid;
begin
  v_branch_id := split_part(p_name, '/', 1)::uuid;
  v_owner_id := split_part(p_name, '/', 2)::uuid;
  return public.can_access_branch(v_branch_id)
    and (
      v_owner_id = auth.uid()
      or public.current_user_has_role(array['admin'::public.app_role])
    );
exception when invalid_text_representation then
  return false;
end;
$$;

create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.email is distinct from old.email then
    raise exception 'Profile email is synchronized from Supabase Auth'
      using errcode = '42501';
  end if;

  if auth.uid() = old.id
     and (
       new.role is distinct from old.role
       or new.active is distinct from old.active
     ) then
    raise exception 'Users cannot change their own role or active status'
      using errcode = '42501';
  end if;

  if not public.current_user_has_role(array['admin'::public.app_role]) then
    if new.role is distinct from old.role
       or new.active is distinct from old.active then
      raise exception 'Only administrators can change role or active status'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_privilege_escalation
before update on public.profiles
for each row execute function public.prevent_profile_privilege_escalation();

create or replace function public.enforce_inventory_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
begin
  if auth.uid() is null then
    return new;
  end if;

  select role into v_role
  from public.profiles
  where id = auth.uid() and active;

  if v_role = 'admin'::public.app_role then
    new.updated_by := auth.uid();
    if new.deleted_at is not null and old.deleted_at is null then
      new.deleted_by := auth.uid();
    end if;
    return new;
  end if;

  if v_role = 'staff'::public.app_role
     and old.report_type = 'sold_out'::public.inventory_report_type
     and new.branch_id = old.branch_id
     and new.report_type = old.report_type
     and new.lens_type is not distinct from old.lens_type
     and new.description is not distinct from old.description
     and new.tag is not distinct from old.tag
     and new.inventory_date is not distinct from old.inventory_date
     and new.external_key is not distinct from old.external_key
     and new.source_row_number is not distinct from old.source_row_number
     and new.source_metadata is not distinct from old.source_metadata
     and new.import_batch_id is not distinct from old.import_batch_id
     and new.created_by is not distinct from old.created_by
     and new.created_at is not distinct from old.created_at
     and new.deleted_at is not distinct from old.deleted_at
     and new.deleted_by is not distinct from old.deleted_by then
    new.updated_by := auth.uid();
    return new;
  end if;

  raise exception 'Inventory update is not permitted' using errcode = '42501';
end;
$$;

create trigger inventory_enforce_update
before update on public.inventory_items
for each row execute function public.enforce_inventory_update();

create or replace function public.audit_inventory_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  insert into public.audit_events (
    actor_id, action, target_table, target_id, branch_id, before_state, after_state
  )
  values (
    auth.uid(),
    case
      when old.deleted_at is null and new.deleted_at is not null then 'inventory.archive'
      else 'inventory.update'
    end,
    'inventory_items',
    new.id::text,
    new.branch_id,
    to_jsonb(old),
    to_jsonb(new)
  );
  return new;
end;
$$;

create trigger inventory_audit_mutation
after update on public.inventory_items
for each row execute function public.audit_inventory_mutation();

alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.user_branch_access enable row level security;
alter table public.inventory_items enable row level security;
alter table public.import_jobs enable row level security;
alter table public.import_batches enable row level security;
alter table public.export_jobs enable row level security;
alter table public.audit_events enable row level security;

create policy branches_select_authorized on public.branches
for select to authenticated
using (
  public.current_user_is_active()
  and (public.current_user_has_role(array['admin'::public.app_role]) or public.can_access_branch(id))
);
create policy branches_admin_insert on public.branches
for insert to authenticated
with check (public.current_user_has_role(array['admin'::public.app_role]));
create policy branches_admin_update on public.branches
for update to authenticated
using (public.current_user_has_role(array['admin'::public.app_role]))
with check (public.current_user_has_role(array['admin'::public.app_role]));

create policy profiles_select_self_or_admin on public.profiles
for select to authenticated
using (
  public.current_user_is_active()
  and (id = auth.uid() or public.current_user_has_role(array['admin'::public.app_role]))
);
create policy profiles_update_self on public.profiles
for update to authenticated
using (
  public.current_user_is_active()
  and id = auth.uid()
)
with check (
  public.current_user_is_active()
  and id = auth.uid()
);

create policy branch_access_select_self_or_admin on public.user_branch_access
for select to authenticated
using (
  public.current_user_is_active()
  and (user_id = auth.uid() or public.current_user_has_role(array['admin'::public.app_role]))
);
create policy inventory_select_authorized on public.inventory_items
for select to authenticated
using (deleted_at is null and public.can_access_branch(branch_id));
create policy inventory_staff_admin_update on public.inventory_items
for update to authenticated
using (
  deleted_at is null
  and public.can_access_branch(branch_id)
  and public.current_user_has_role(array['admin'::public.app_role, 'staff'::public.app_role])
)
with check (
  public.can_access_branch(branch_id)
  and public.current_user_has_role(array['admin'::public.app_role, 'staff'::public.app_role])
);

create policy import_jobs_select_owner_or_admin on public.import_jobs
for select to authenticated
using (
  public.current_user_is_active()
  and public.can_access_branch(branch_id)
  and (requested_by = auth.uid() or public.current_user_has_role(array['admin'::public.app_role]))
);
create policy import_batches_select_owner_or_admin on public.import_batches
for select to authenticated
using (
  public.current_user_is_active()
  and public.can_access_branch(branch_id)
  and (
    created_by = auth.uid()
    or public.current_user_has_role(array['admin'::public.app_role])
  )
);
create policy export_jobs_select_owner_or_admin on public.export_jobs
for select to authenticated
using (
  public.current_user_is_active()
  and public.can_access_branch(branch_id)
  and (requested_by = auth.uid() or public.current_user_has_role(array['admin'::public.app_role]))
);
create policy audit_events_admin_select on public.audit_events
for select to authenticated
using (public.current_user_has_role(array['admin'::public.app_role]));

revoke all on public.branches, public.profiles, public.user_branch_access,
  public.inventory_items, public.import_jobs, public.import_batches,
  public.export_jobs, public.audit_events from anon;
grant select, insert, update on public.branches to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.user_branch_access to authenticated;
grant select, update on public.inventory_items to authenticated;
grant select on public.import_jobs, public.import_batches, public.export_jobs, public.audit_events to authenticated;
grant usage, select on sequence public.audit_events_id_seq to service_role;

revoke all on function public.current_user_is_active() from public;
revoke all on function public.current_user_has_role(public.app_role[]) from public;
revoke all on function public.can_access_branch(uuid) from public;
revoke all on function public.can_access_storage_object(text) from public;
grant execute on function public.current_user_is_active() to authenticated, service_role;
grant execute on function public.current_user_has_role(public.app_role[]) to authenticated, service_role;
grant execute on function public.can_access_branch(uuid) to authenticated, service_role;
grant execute on function public.can_access_storage_object(text) to authenticated, service_role;

insert into public.branches (id, code, name)
values
  ('a0000000-0000-4000-8000-000000000001', 'GAI', 'Gaisano Iloilo'),
  ('a0000000-0000-4000-8000-000000000002', 'CAS', 'Casa Plaza'),
  ('a0000000-0000-4000-8000-000000000003', 'BAC', 'Bacolod')
on conflict (code) do update
set name = excluded.name, active = true;

commit;
