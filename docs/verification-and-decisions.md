# Verification, assumptions, and unresolved decisions

## Verification record

Documentation commands are not test results. Before a release, record the
actual commit, date, environment, command, and result for each check:

| Check | Command or evidence | Status |
| --- | --- | --- |
| Dependency install | `npm install` | Passed 2026-07-24; 0 audit findings |
| TypeScript | `npm run typecheck` | Passed 2026-07-24 |
| Lint | `npm run lint` | Passed 2026-07-24 |
| Unit/component tests | `npm test` | Passed 2026-07-24; 37 tests |
| Production build | `npm run build` | Passed 2026-07-24 |
| Migration lint | `supabase db lint --local --level warning` | Blocked: Docker/local database unavailable |
| Local migration reset | `supabase db reset` | Blocked: Docker daemon unavailable |
| Database/RLS tests | Embedded PostgreSQL harness | Passed with extension limitations described below |
| Edge Function tests | Deno fmt, lint, check and workbook smoke test | Passed 2026-07-24 |
| Staging Auth smoke test | invite, login, expiry, logout | Not recorded here |
| Local rendered-page smoke test | DOM, layout metrics, and browser console | Passed 2026-07-24; login page, no console errors |

The release report, CI logs, or final implementation handoff should contain
the real outcomes. Never convert “Not recorded here” to “Passed” without a
successful run.

### Backend verification performed during implementation

The backend implementation work recorded these successful checks:

- Deno formatting, linting, and type checking for the Edge Functions;
- workbook parser smoke test;
- all five migrations plus fictional seed executed in an embedded PostgreSQL
  harness after omitting extensions unavailable in that harness
  (`pgcrypto`/`pg_trgm`) and the dependent trigram indexes;
- import, inventory page, clear-report, and admin-user RPC integration checks;
  and
- RLS visibility checks: admin saw four seeded rows, assigned staff saw two,
  and assigned viewer saw one.

`supabase db lint --local` and a true `supabase db reset` were not run because
Docker/local Supabase PostgreSQL was unavailable. The embedded harness gives
useful SQL coverage but does not replace a clean local Supabase reset, extension
creation, Storage-policy test, or hosted staging verification.

## Minimum behavior matrix

Tests should cover:

- unauthenticated users cannot open protected routes or query data;
- inactive users are denied despite a valid Auth session;
- session restoration does not flash protected content;
- admin, assigned staff/viewer, and unassigned users receive the correct
  branch/report rows;
- viewer mutations fail at both UI and database layers;
- users cannot change their role or branch assignments;
- filtering searches tag, SI, and description and paginates deterministically;
- selected-branch totals match the active report/search scope;
- SI validation and audit before/after state;
- confirmation and server rejection paths for archive/clear;
- import header/row validation, duplicates, preview, idempotent apply, partial
  errors, and terminal job states;
- export authorization, worksheet contents, private object policy, signed URL
  expiry, and retry behavior;
- empty, loading, timeout, network, expired-session, and function failure UI;
- RLS policies using separate users for every role and branch assignment; and
- audit records cannot be changed by ordinary users.

## Assumptions made

- The application remains a browser-based internal administration tool; React
  Native is out of scope.
- `GAI`, `CAS`, and `BAC` are stable branch codes.
- One unified inventory table with `stocks`, `sold_out`, and `audit` report
  types is sufficient for the current operational view.
- Normal deletion and report clear use recoverable archival, not physical
  deletion.
- Admins can access every active branch.
- Staff may view/search assigned branches and edit permitted Sold Out SI.
  Other staff operations default to denied until approved.
- Viewers are read-only within assigned branches.
- Imports are Stocks-only and use preview followed by explicit replacement
  confirmation.
- Import and export objects are private.
- Summary totals default to all authorized branches and are explicitly labeled;
  selecting a branch narrows that scope.
- The legacy backend and spreadsheet structure cannot be audited from this
  repository.

## Unresolved business decisions

These decisions do not justify guessing in production:

1. **Legacy workbook mapping:** exact header aliases, sheet selection, date
   formats, formulas/macros, maximum rows/file size, and blank-value rules.
2. **Record identity/duplicates:** whether tag is unique within a branch/report,
   across reports, or reusable over time; how SI participates in matching.
3. **Replacement semantics:** whether a confirmed Stocks import always replaces
   all active branch Stocks, or whether upsert/append modes are also needed.
4. **Partial imports:** whether `completed_with_errors` may apply valid rows or
   whether any rejected row must block the entire apply.
5. **SI validation:** whether the implemented 120-character, nullable
   free-text rule needs a stricter format.
6. **Totals scope:** selected branch vs. all authorized branches and whether
   search filters affect the summary cards.
7. **Staff policy:** permission to archive, import, export, or perform other
   operational updates.
8. **Clear recovery window:** how long archived records must remain recoverable
   before physical purge.
9. **File retention:** retention for original imports, error reports, and
   generated exports.
10. **Audit retention and access:** retention period, compliance requirements,
    and whether non-admin supervisors need read access.
11. **Auth operations:** invite owner, permitted email domains, OTP vs.
    magic-link preference, session lifetime, and MFA requirement for admins.
12. **Export contract:** reports included, worksheet/column order, formatting,
    time zone, and whether archived records can be exported.
13. **Date semantics:** business time zone and whether `inventory_date` is a
    date-only source value or derived from an event timestamp.
14. **Migration conflicts:** authoritative resolution when legacy files contain
    duplicate or contradictory records.
15. **Durable job execution:** the current Edge Functions record job lifecycle
    state but perform import/export work within the initiating request. Before
    raising the file/row limits, decide whether production needs a durable
    queue/worker with retry and resume semantics.

## Production readiness gates

Production cutover is blocked until:

- representative legacy workbooks are validated;
- all unresolved data-loss/security decisions above are approved;
- RLS and privileged functions pass role/branch tests;
- migrations and seed run cleanly from an empty local database;
- staging import/export/clear recovery is exercised;
- backup restoration is rehearsed;
- first-admin and invite-only Auth procedures are proven;
- production secrets and redirect URLs are configured;
- source/destination reconciliation is signed off; and
- the owner explicitly approves migration and cutover.
