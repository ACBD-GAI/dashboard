import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { MigrationResult } from "./types";

function csvCell(value: unknown): string {
  const text =
    typeof value === "string" ? value : value == null ? "" : JSON.stringify(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(headers: string[], rows: object[]): string {
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => {
      const values = row as Record<string, unknown>;
      return headers.map((header) => csvCell(values[header])).join(",");
    }),
  ].join("\n");
}

export async function writeMigrationReports(
  result: MigrationResult,
  outputDirectory: string,
): Promise<string> {
  const directory = resolve(outputDirectory);
  await mkdir(directory, { recursive: true });

  const acceptedHeaders = [
    "branch_code",
    "report_type",
    "lens_type",
    "description",
    "tag",
    "si",
    "inventory_date",
    "external_key",
    "source_row_number",
    "source_metadata",
  ];
  const rejectionHeaders = [
    "source_file",
    "source_sheet",
    "source_row_number",
    "reasons",
    "row",
  ];
  const reconciliation = {
    mode: result.mode,
    fingerprint: result.fingerprint,
    confirmation_token: result.confirmation_token,
    generated_at: result.generated_at,
    rows_read: result.rows_read,
    rows_accepted: result.rows_accepted,
    rows_rejected: result.rows_rejected,
    duplicates_in_source: result.duplicates_in_source,
    already_in_destination: result.already_in_destination,
    rows_ready_to_write: result.rows_ready_to_write,
    destination_snapshot_count: result.destination_snapshot_count,
    destination_count_after_expected: result.destination_count_after_expected,
    write_summary: result.write_summary ?? null,
    sources: result.sources,
  };

  await Promise.all([
    writeFile(
      resolve(directory, "accepted.csv"),
      `${toCsv(acceptedHeaders, result.accepted)}\n`,
      "utf8",
    ),
    writeFile(
      resolve(directory, "rejected.csv"),
      `${toCsv(rejectionHeaders, [...result.rejected, ...result.duplicate_rows])}\n`,
      "utf8",
    ),
    writeFile(
      resolve(directory, "already-present.csv"),
      `${toCsv(acceptedHeaders, result.already_present)}\n`,
      "utf8",
    ),
    writeFile(
      resolve(directory, "reconciliation.json"),
      `${JSON.stringify(reconciliation, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      resolve(directory, "migration-plan.json"),
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    ),
  ]);
  return directory;
}
