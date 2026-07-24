# Acebedo Inventory Dashboard documentation

This directory documents the React and Supabase replacement for the legacy
single-file inventory dashboard. The legacy implementation is retained in
`legacy/index.html` for comparison and rollback; it is not the target
architecture.

## What the application does

Acebedo Optical operations users use the dashboard to search and maintain
inventory for:

| Code | Branch |
| --- | --- |
| `GAI` | Gaisano Iloilo |
| `CAS` | Casa Plaza |
| `BAC` | Bacolod |

Inventory is presented using the established business terms:

| UI label | Database value | Meaning |
| --- | --- | --- |
| Stocks | `stocks` | Currently available inventory |
| Sold Out | `sold_out` | Sold inventory |
| Re-Inventory | `audit` | Audited or recounted inventory |

The target application supports passwordless sign-in, branch-scoped search,
server-side totals and pagination, SI correction for Sold Out records,
recoverable record/report archival, stock workbook imports, exports, job
tracking, and audit history.

## Documentation map

- [Architecture and application flows](architecture.md)
- [Data model and authorization](data-and-security.md)
- [Import, export, and administration](operations.md)
- [Local setup, Supabase setup, and deployment](deployment.md)
- [Migration, cutover, backup, recovery, and rollback](migration-and-recovery.md)
- [Verification, assumptions, and unresolved decisions](verification-and-decisions.md)

## Confirmed legacy baseline

The behavior below was confirmed by inspecting the retained legacy HTML:

- Authentication used a Gmail allowlist, emailed OTP, backend session ID, and
  browser `localStorage`.
- The browser considered a session expired after 13 hours and checked it with
  the external backend at application startup.
- Branches were `GAI`, `CAS`, and `BAC`.
- Reports were `stocks`, `SCANRESULTS`, and `AUDIT`.
- Search covered tag, SI, and description.
- Results were paginated in the browser at 20 rows per page after downloading
  the result set.
- Only Sold Out rows exposed SI edit and delete actions.
- Excel uploads accepted `.xlsx` and `.xls`.
- Import and export jobs were polled every three seconds.
- Clearing a report removed a branch/report dataset after confirmation.
- Authentication, storage, import, export, and job processing were handled by
  an external Google Apps Script endpoint whose source is not in this
  repository.

The legacy use of a spreadsheet row number as record identity is deliberately
not preserved. Supabase records use stable generated IDs.

At the compatibility boundary, the normalizer also accepts `re_inventory` and
`re-inventory`; PostgreSQL stores the canonical value `audit`.

## Documentation status

These documents describe the intended production architecture and operating
model. Commands and checks are not evidence that they have run. See
[Verification](verification-and-decisions.md#verification-record) for the
checks that must be recorded before release, and do not mark an unchecked item
as passed.
