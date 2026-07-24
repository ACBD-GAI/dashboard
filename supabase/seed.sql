-- Local-only fictional inventory. Authentication users are intentionally not
-- inserted here: create them through Supabase Auth, then use the documented
-- first-admin SQL procedure so local setup mirrors invite-only production.

insert into public.inventory_items (
  id, branch_id, report_type, lens_type, description, tag, si, inventory_date,
  external_key, source_metadata
)
values
  (
    'b0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'stocks', 'Single Vision', 'Fictional Blue Frame', 'DEMO-GAI-001', null,
    '2026-07-01', 'DEMO-GAI-001', '{"fixture": true}'::jsonb
  ),
  (
    'b0000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000001',
    'sold_out', 'Progressive', 'Fictional Tortoise Frame', 'DEMO-GAI-002',
    'SI-DEMO-1001', '2026-07-02', 'DEMO-GAI-002', '{"fixture": true}'::jsonb
  ),
  (
    'b0000000-0000-4000-8000-000000000003',
    'a0000000-0000-4000-8000-000000000002',
    'audit', 'Reading', 'Fictional Silver Frame', 'DEMO-CAS-001', null,
    '2026-07-03', 'DEMO-CAS-001', '{"fixture": true}'::jsonb
  ),
  (
    'b0000000-0000-4000-8000-000000000004',
    'a0000000-0000-4000-8000-000000000003',
    'stocks', 'Single Vision', 'Fictional Black Frame', 'DEMO-BAC-001', null,
    '2026-07-04', 'DEMO-BAC-001', '{"fixture": true}'::jsonb
  )
on conflict (id) do nothing;
