import { createHash } from "node:crypto";
import type {
  MigrationResult,
  NormalizeDefaults,
  RawLegacyRow,
  RejectedRow,
  SourceStats,
} from "./types";
import { normalizeLegacyRow } from "./normalize";

function rowIdentity(row: {
  branch_code: string;
  report_type: string;
  external_key: string;
}): string {
  return `${row.branch_code}\u001f${row.report_type}\u001f${row.external_key}`;
}

export function buildMigrationResult(
  rawRows: RawLegacyRow[],
  defaults: NormalizeDefaults,
  destinationKeys?: Set<string>,
  generatedAt = new Date().toISOString(),
): MigrationResult {
  const accepted = [];
  const rejected: RejectedRow[] = [];
  const duplicateRows: RejectedRow[] = [];
  const alreadyPresent = [];
  const seen = new Map<string, RawLegacyRow>();

  for (const raw of rawRows) {
    const normalized = normalizeLegacyRow(raw, defaults);
    if (normalized.rejection) {
      rejected.push(normalized.rejection);
      continue;
    }
    const row = normalized.row!;
    const identity = rowIdentity(row);
    const prior = seen.get(identity);
    if (prior) {
      duplicateRows.push({
        source_file: raw.sourceFile,
        source_sheet: raw.sourceSheet,
        source_row_number: raw.sourceRowNumber,
        reasons: [
          `Duplicate of ${prior.sourceFile}/${prior.sourceSheet} row ${prior.sourceRowNumber}`,
        ],
        row: raw.values,
      });
      continue;
    }
    seen.set(identity, raw);
    if (
      destinationKeys?.has(identity) ||
      destinationKeys?.has(row.external_key) ||
      destinationKeys?.has(`*\u001f*\u001f${row.external_key}`)
    ) {
      alreadyPresent.push(row);
    } else {
      accepted.push(row);
    }
  }

  const sourceHashes = [...new Set(rawRows.map((row) => row.sourceSha256))].sort();
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        sourceHashes,
        externalKeys: [...seen.keys()].sort(),
      }),
    )
    .digest("hex");
  const confirmationToken = `MIGRATE:${fingerprint.slice(0, 12)}:${accepted.length}`;

  const sources = new Map<string, SourceStats>();
  for (const raw of rawRows) {
    const key = `${raw.sourceFile}\u001f${raw.sourceSha256}`;
    if (!sources.has(key)) {
      sources.set(key, {
        file: raw.sourceFile,
        sha256: raw.sourceSha256,
        rows_read: 0,
        rows_accepted: 0,
        rows_rejected: 0,
      });
    }
    sources.get(key)!.rows_read += 1;
  }
  for (const row of [...accepted, ...alreadyPresent]) {
    const key = `${row.source_metadata.legacy_file}\u001f${row.source_metadata.source_sha256}`;
    sources.get(key)!.rows_accepted += 1;
  }
  for (const row of [...rejected, ...duplicateRows]) {
    const matching = [...sources.entries()].find(([key]) =>
      key.startsWith(`${row.source_file}\u001f`),
    );
    if (matching) matching[1].rows_rejected += 1;
  }

  return {
    mode: "dry-run",
    fingerprint,
    confirmation_token: confirmationToken,
    generated_at: generatedAt,
    rows_read: rawRows.length,
    rows_accepted: accepted.length + alreadyPresent.length,
    rows_rejected: rejected.length,
    duplicates_in_source: duplicateRows.length,
    already_in_destination: alreadyPresent.length,
    rows_ready_to_write: accepted.length,
    destination_snapshot_count: destinationKeys?.size ?? null,
    destination_count_after_expected: destinationKeys
      ? destinationKeys.size + accepted.length
      : null,
    sources: [...sources.values()],
    accepted,
    rejected,
    duplicate_rows: duplicateRows,
    already_present: alreadyPresent,
  };
}
