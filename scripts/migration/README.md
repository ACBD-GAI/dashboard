# Legacy inventory migration tool

`scripts/migrate-legacy.ts` converts legacy CSV, XLSX, or XLS exports into the
canonical Supabase inventory shape without modifying the source files. It is a
dry run unless all write safeguards are supplied.

## Confirmed and inferred mappings

The legacy UI confirms these branch and report identifiers:

| Legacy value | Canonical value |
| --- | --- |
| `GAI`, Gaisano Iloilo | `GAI` |
| `CAS`, Casa Plaza | `CAS` |
| `BAC`, Bacolod | `BAC` |
| `stocks` | `stocks` |
| `SCANRESULTS` | `sold_out` |
| `AUDIT` | `audit` |

The header aliases and the rule requiring `description` plus at least one of
`tag` or `SI` are conservative inferences because a real source workbook and
the Google Apps Script backend are not available. Validate those rules against
a representative production export before cutover. ISO dates, Excel date cells,
Excel serial dates, and JavaScript-recognized textual dates are accepted;
ambiguous textual dates should be converted to ISO `YYYY-MM-DD` before cutover.

## Dry run

```bash
npm run migrate:legacy -- \
  --input ./private-exports/gai-stocks.xlsx \
  --branch GAI \
  --report stocks \
  --destination-snapshot ./private-exports/current-destination.csv \
  --out ./migration-output/gai-stocks
```

`--branch` and `--report` are defaults. A recognized value in a source row wins;
otherwise the tool can also infer values from the filename or worksheet name.

The output directory contains:

- `migration-plan.json`: full canonical payload and row-level outcomes.
- `reconciliation.json`: source, rejection, duplicate, destination, and expected
  post-write counts.
- `accepted.csv`: validated records not present in the destination snapshot.
- `already-present.csv`: records skipped because their `external_key` exists.
- `rejected.csv`: validation failures and within-source duplicates with reasons.

The optional destination snapshot must contain an `external_key` column.
Exporting that column immediately before the dry run gives the strongest replay
and count comparison.

## Idempotency

When no legacy external key exists, the tool derives `external_key` from the
normalized branch, report, lens type, description, tag, SI, and inventory date.
It also sends the plan fingerprint as the HTTP `Idempotency-Key`. The secure
server endpoint checks completed source fingerprints and upserts exact external
keys within the branch and report. Do not run overlapping migrations for the
same branch: client-side detection and the current lookup-then-write RPC are not
a substitute for a database uniqueness constraint under concurrent requests.

Changing any identity field intentionally produces a new key. Ambiguous legacy
duplicates are reported rather than silently merged.

## Explicitly confirmed write

First run the command without `--write`. Review every report and copy the exact
confirmation token printed by that run. Then use the same inputs and defaults:

```bash
SUPABASE_MIGRATION_ACCESS_TOKEN='<short-lived-user-access-token>' \
npm run migrate:legacy -- \
  --input ./private-exports/gai-stocks.xlsx \
  --branch GAI \
  --report stocks \
  --destination-snapshot ./private-exports/current-destination.csv \
  --out ./migration-output/gai-stocks \
  --write \
  --confirm 'MIGRATE:<fingerprint-prefix>:<row-count>' \
  --write-endpoint 'https://<project>.supabase.co/functions/v1/migrate-legacy-inventory' \
  --branch-id '<destination-branch-uuid>'
```

The tool does not read a service-role key. The included
`migrate-legacy-inventory` Edge Function verifies the supplied Supabase user
token, requires an active administrator with access to the named branch,
validates the payload again, invokes the privileged import transaction, and
writes an audit event. Write plans containing more than one branch are rejected;
run and reconcile each branch independently. Do not point this option at an
unverified generic HTTP endpoint.

Obtain `--branch-id` from the destination project's `branches` table and verify
its code against the plan before confirming. Do not copy a UUID from another
environment merely because its branch code looks familiar.

After a successful response, `reconciliation.json` is rewritten with
`mode: "write"` and the endpoint's inserted, updated, skipped, and optional
`destination_count_after` values. Preserve this report as cutover evidence.

The ordinary import Edge Function consumes a private uploaded workbook. Legacy
cutover uses the separate canonical-row endpoint so migration-specific
idempotency and audit evidence remain explicit.
