# Migration, cutover, backup, recovery, and rollback

## Legacy data migration

The Google Apps Script and backing storage implementation are unavailable, so
the source of truth must be exported without modifying it. Preserve original
CSV/Excel files read-only and compute checksums before transformation.

### Dry-run pipeline

1. Export every branch/report combination from the legacy system.
2. Save originals under access-controlled, immutable storage outside the
   repository; record file name, size, checksum, export time, branch, and
   report.
3. Parse copies using the migration tool in dry-run mode.
4. Normalize branch aliases to `GAI`, `CAS`, or `BAC` and report aliases:
   `stocks` → `stocks`, `SCANRESULTS` → `sold_out`, `AUDIT` → `audit`.
5. Validate required values and dates, preserve source row/sheet/file metadata,
   and identify duplicates.
6. Produce accepted, rejected, and duplicate reports without database writes.
7. Resolve mapping and duplicate policy questions with the business owner.
8. Load into staging using an idempotency key derived from source checksum and
   source identity.
9. Compare source, accepted, rejected, inserted, and destination counts by
   branch/report.
10. Sample records by tag/SI and obtain business sign-off.

Production write mode must require an explicit flag/confirmation and a
production change approval. It must not infer the target project from an
unverified shell environment. Never alter or overwrite original exports.

The repository migration CLI is dry-run by default:

```sh
npm run migrate:legacy -- \
  --input /absolute/path/to/source.xlsx \
  --branch GAI \
  --report stocks \
  --out /absolute/path/to/migration-reports
```

It accepts repeated `--input`, optional CSV/XLSX destination snapshots, and
writes a migration plan plus accepted, rejected, already-present, and
reconciliation JSON/CSV artifacts. The complete option reference is in
[`scripts/migration/README.md`](../scripts/migration/README.md).

For an approved write, repeat the same inputs with the exact dry-run
confirmation token, destination branch UUID, secure Edge Function endpoint, and
a short-lived `SUPABASE_MIGRATION_ACCESS_TOKEN`:

```sh
npm run migrate:legacy -- \
  --input /absolute/path/to/source.xlsx \
  --branch GAI \
  --report stocks \
  --out /absolute/path/to/migration-reports \
  --write \
  --confirm 'MIGRATE:EXACT_TOKEN:COUNT' \
  --write-endpoint 'https://PROJECT_REF.supabase.co/functions/v1/migrate-legacy-inventory' \
  --branch-id 'DESTINATION_BRANCH_UUID'
```

The migration CLI intentionally does not read or accept the service-role key.
Its destination snapshot must contain `external_key`; write-mode authorization
is still enforced by the Edge Function. The write request sends the canonical
snake-case `source_fingerprint` and the same value in `Idempotency-Key`; the
endpoint rejects a mismatch. The CLI intentionally restricts a write plan to
one destination branch even though the server groups and validates incoming
records defensively.

## Reconciliation

The post-load report should contain, per source file and branch/report:

- source row count;
- blank rows ignored;
- accepted rows;
- rejected rows and reason categories;
- duplicate rows and resolution;
- inserted/updated/skipped rows;
- destination active count;
- source and result checksums;
- import batch/job ID; and
- start/end timestamps.

Counts alone are insufficient. Verify representative records, totals, dates,
non-ASCII descriptions, leading zeros in tag/SI, and the three report
classifications.

## Backup policy

Before production migration and each destructive maintenance window:

- confirm the Supabase database backup/PITR capability for the project's plan;
- take or verify a recent logical/database backup;
- export relevant tables with schema/migration version recorded;
- preserve private Storage uploads/error reports needed for the agreed
  retention period;
- verify backup encryption and access controls; and
- rehearse restoration into a separate non-production project.

A dashboard showing “backup enabled” is not a restore test. Record the latest
successful restore rehearsal, duration, and owner in the operational change
ticket.

## Application-level recovery

### Recover an individual record

An admin locates the archive audit event and stable record ID, verifies that a
replacement has not created a conflict, and uses the privileged recovery
operation to clear archival metadata. The recovery writes a new audit event.

### Recover a cleared report

Use the clear operation's audit event ID and exact `clearedAt` timestamp:

1. stop imports and edits for the affected branch/report;
2. inspect the clear audit event and affected count;
3. preview rows whose branch, report, `deleted_by`, and `deleted_at` match that
   operation exactly;
4. check for conflicts with records created after the clear;
5. restore in a transaction through a privileged recovery path;
6. reconcile active counts; and
7. write and retain the recovery audit event.

Do not run an unrestricted SQL update such as “unarchive all.” If a dedicated
recovery function is not implemented, restore through an approved, reviewed
SQL change using the exact operation ID and backup evidence.

### Recover a failed replacement import

Because replace mode archives the former dataset rather than physically
deleting it, identify the import batch and previous dataset archive marker.
Rollback the batch and restore the prior dataset transactionally. If the
failure occurred outside the transaction boundary, stop further writes and
restore from the last verified backup in an isolated environment first.

## Production cutover

Cutover requires explicit user/owner approval.

1. Complete staging migration and reconciliation.
2. Resolve workbook mapping, duplicate, totals-scope, staff-permission, and
   retention decisions.
3. Confirm backups and a tested rollback owner/window.
4. Deploy compatible production migrations, policies, buckets, secrets, and
   Edge Functions.
5. Provision the first admin and verify roles with fictional or controlled
   staging data before production.
6. Announce a legacy write freeze and record its start time.
7. Export final legacy source files and checksums.
8. Run production migration dry-run; review and approve its report.
9. Run explicit production write mode.
10. Reconcile every branch/report, then obtain business sign-off.
11. Deploy/switch traffic to the React application.
12. Perform login and read-only searches for each role and assigned branch.
13. Monitor Auth, API, database, Storage, and function errors.
14. Keep the legacy system read-only during the agreed stabilization window.

Do not delete the legacy HTML, legacy data, or original exports as part of
cutover.

## Rollback

Define a go/no-go checkpoint and rollback deadline before cutover. Roll back
when authentication, RLS, reconciliation, or critical operations are unsafe.

1. Stop writes to the new application.
2. Capture logs, job IDs, audit events, database time, and the last successful
   request; do not destroy evidence.
3. Restore the previous web deployment or route users to the retained legacy
   application.
4. If legacy writes must resume, communicate that Supabase is no longer the
   source of truth and record the divergence start time.
5. For an application-only defect, keep the compatible Supabase schema and
   deploy the previous web/function versions.
6. For a data defect, restore into a separate project first, validate, and then
   execute the approved database recovery. Avoid down migrations that discard
   data.
7. Reconcile changes made during the failed cutover before attempting another
   migration.

Rollback is not complete until the business owner confirms which system is
authoritative and operators receive clear instructions.
