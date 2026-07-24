begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inventory-imports',
  'inventory-imports',
  false,
  10485760,
  array[
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inventory-exports',
  'inventory-exports',
  false,
  20971520,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy inventory_imports_insert_authorized
on storage.objects for insert to authenticated
with check (
  bucket_id = 'inventory-imports'
  and public.current_user_has_role(array['admin'::public.app_role])
  and public.can_access_storage_object(name)
);

create policy inventory_imports_select_authorized
on storage.objects for select to authenticated
using (
  bucket_id = 'inventory-imports'
  and public.can_access_storage_object(name)
);

create policy inventory_imports_delete_owner_or_admin
on storage.objects for delete to authenticated
using (
  bucket_id = 'inventory-imports'
  and public.can_access_storage_object(name)
);

create policy inventory_exports_select_authorized
on storage.objects for select to authenticated
using (
  bucket_id = 'inventory-exports'
  and public.can_access_storage_object(name)
);

commit;
