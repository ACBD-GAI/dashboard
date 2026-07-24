# Import, export, and administration

## Excel import

Imports affect only the `Stocks` report for one explicitly selected and
authorized branch. They are processed server-side; the browser does not parse
and write privileged production data directly.

### Workflow

1. The user chooses a branch and `.xlsx` or `.xls` workbook.
2. The client rejects unsupported extensions and files above 10 MiB before
   upload. The private bucket enforces the same 10 MiB ceiling; the Edge
   Function repeats type, size, and content validation.
3. The original file is uploaded to a job-scoped path in the private
   `inventory-imports` bucket.
4. An `import_jobs` record is created and moves through `pending`/`running`.
5. `process-import` verifies the user, role, branch access, job ownership, and
   Storage object.
6. The workbook is parsed and headers/rows are validated server-side.
7. A preview reports row-level issues and the number of rows that would be
   inserted, updated, skipped, or rejected.
8. The user must explicitly confirm the branch and **replace Stocks** mode.
9. Apply runs transactionally where practical: the previous active Stocks
   dataset is archived, valid replacement rows are inserted, the batch and
   audit event are recorded, and the job reaches a terminal status.
10. The dashboard refreshes affected queries and offers a private error report
    when rows were rejected.

Preview does not change inventory. Apply must be idempotent by job ID and/or
source checksum so a retry cannot apply the same confirmed job twice.

The privileged backend supports `append`, `upsert`, and `replace` strategies so
an approved future policy can reuse the transaction. The current dashboard
offers only preview and an explicit `replace` apply for branch Stocks. Operators
must not invoke append/upsert directly until the identity and duplicate rules
are approved.

### Job states

The UI recognizes:

- `pending`
- `running`
- `completed`
- `completed_with_errors`
- `failed`

The database also defines `cancelled`, and the implementation may include an
intermediate preview/awaiting-confirmation state. The UI must treat unknown
states as non-success and show a recoverable error. Polling must be bounded and
use backoff, or be replaced by Supabase Realtime; closing the browser does not
cancel server work.

### Provisional workbook contract

No representative legacy workbook is available in this repository. Therefore
the mapping below is provisional and must be validated against a real,
non-production sample before production cutover.

Use the first worksheet and one header row:

| Canonical header | Required | Meaning | Example |
| --- | :---: | --- | --- |
| `lens_type` | No | Lens or product classification | `Single Vision` |
| `description` | Yes | Inventory description | `Metal frame, black` |
| `tag` | No | Operational item tag | `GAI-000123` |
| `si` | No | Sales invoice/reference | `SI-10492` |
| `inventory_date` | No | ISO date or unambiguous Excel date | `2026-07-24` |
| `external_key` | No | Stable source key for duplicate/upsert detection | `GAI-000123` |

The branch is selected in the UI and must not be trusted from a workbook
column. The dashboard submits `stocks` for this workflow. The generic server
parser also recognizes a report/status column for migration compatibility; a
normal Stocks workbook should omit it or contain only `stocks`. Production
readiness requires a server test proving an ordinary Stocks replacement cannot
silently change another report.

The parser reads the first worksheet and at most 10,000 data rows. It accepts
common spaced variants such as `Item Description`, `Tag Number`, `SI Number`,
`Lens Type`, `Stock Date`, and `External Key`. Description is limited to 500
characters; tag and lens type to 200; SI to 120; and an external key to 300.
When no external key is supplied, the parser derives a SHA-256 semantic key.

Blank rows are ignored by normal workbook parsing. Invalid non-blank dates and
unsupported report values are row errors. Formulas, macros, hidden sheets,
duplicate headers, ambiguous locale dates, and duplicate business tags still
require validation against a representative legacy workbook.

The error report should include source row number, normalized values, and one or
more rejection reasons without modifying the original workbook.

### Import summary

Every terminal job records:

- rows read;
- rows inserted;
- rows updated;
- rows skipped;
- rows rejected;
- source file name and checksum;
- branch and import mode; and
- error report path, if any.

Original uploads and error reports stay private. Define and automate their
retention before production; a provisional target is 30 days, subject to
business and privacy review.

## Export

`process-export` accepts an authorized branch and explicit report/filter scope:

1. Verify the bearer token, active profile, permission, and branch access.
2. Create or claim an `export_jobs` record.
3. Query non-archived records through a server-authorized path.
4. Generate a workbook with clear worksheet and column names.
5. Store it at a job-scoped path in private `inventory-exports`.
6. Record row counts, filters, completion, expiry, and an audit event.
7. Return or mint a short-lived signed URL only after re-authorizing download.

Worksheet names are `Stocks`, `Sold Out`, and `Re-Inventory`. Empty report
worksheets are omitted; an entirely empty export contains one `Inventory`
worksheet with an explanatory row. Columns are branch code, branch name,
report type, lens type, description, tag, SI, inventory date, created time,
and updated time.

Exports stop at a 100,000-row safety limit and the bucket limits the generated
workbook to 20 MiB. Signed download URLs last 10 minutes. Job metadata marks
the generated file to expire after 24 hours, but production cleanup still has
to be scheduled and verified; an expiry timestamp alone does not delete a
Storage object.

## SI correction

SI can be edited only for an active Sold Out record:

- trim and validate the submitted value on both client and server;
- address the record by UUID, never by row position;
- verify current branch access and mutation permission;
- update only the allowed field;
- capture before and after state in an audit event; and
- return a conflict or not-found response if the row changed or was archived.

The implemented baseline trims SI, converts blank to null, and limits it to 120
characters. A stricter business format remains an unresolved decision.

## Individual record archive

Archiving requires a confirmation that identifies the record and branch.
Server code verifies permission, locks/checks the record, sets archival
metadata, and writes one audit event. Recovery is admin-only and writes a
second audit event. Ordinary users cannot physically delete inventory rows.

## Clear report

Clear Report is a high-risk, admin-only operation implemented by
`clear-report`.

The dialog must name both branch and report and require deliberate
confirmation. The exact phrase is
`CLEAR <BRANCH_CODE> <report_enum>`—for example,
`CLEAR GAI sold_out`. The server:

1. verifies the current user is an active admin;
2. validates branch and report IDs;
3. archives only currently active matching rows in a transaction;
4. records the affected row count, exact clear timestamp, and audit event ID;
5. writes a detailed audit event; and
6. returns a safe result without exposing service credentials.

Never exercise this function against production merely as a deployment test.
Recovery uses the audit event ID plus exact branch, report, actor, and clear
timestamp to restore only rows archived by that clear operation. See
[Recovery procedures](migration-and-recovery.md#application-level-recovery).

## Failure handling

- Jobs must record a safe user-facing message and a more detailed server log
  correlation ID.
- Partial apply must roll back where transactionally possible.
- A failed client request must not be interpreted as proof that server work did
  not run; retries use idempotency guards.
- Signed URL expiry is recovered by requesting a newly authorized URL, not by
  making the bucket public.
- Failed imports preserve the source and validation result until retention
  cleanup so an operator can diagnose them.
- Secrets, access tokens, full magic links, and raw sensitive rows are not
  logged.
