#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readLegacySource, readDestinationExternalKeys } from "./migration/read-source";
import { normalizeBranch, normalizeReport } from "./migration/normalize";
import { buildMigrationResult } from "./migration/run";
import { writeMigrationReports } from "./migration/reports";
import { writeMigration } from "./migration/write";
import type { MigrationResult } from "./migration/types";

interface CliOptions {
  inputs: string[];
  branch?: string;
  report?: string;
  destinationSnapshot?: string;
  outputDirectory: string;
  write: boolean;
  confirm?: string;
  endpoint?: string;
  branchId?: string;
}

function usage(): string {
  return `Legacy inventory migration (dry-run by default)

Usage:
  tsx scripts/migrate-legacy.ts --input <file> [--input <file>] [options]

Options:
  --branch <GAI|CAS|BAC>          Default branch when absent from source rows
  --report <stocks|SCANRESULTS|AUDIT>
                                 Default report when absent from source rows
  --destination-snapshot <file>  CSV/XLSX export containing external_key
  --out <directory>              Report directory (default: migration-output)
  --write                        Send accepted rows to the secure migration endpoint
  --confirm <token>              Exact token printed by a preceding dry-run
  --write-endpoint <url>         Supabase Edge Function migration endpoint
  --branch-id <uuid>             Destination branch UUID (required for writes)
  --help                         Show this help

Write mode also requires SUPABASE_MIGRATION_ACCESS_TOKEN. The token must be an
authenticated user access token accepted by the Edge Function; service-role keys
are deliberately not read by this script.`;
}

export function parseArguments(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputs: [],
    outputDirectory: "migration-output",
    write: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === "--help" || argument === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    } else if (argument === "--write") {
      options.write = true;
    } else if (argument === "--input" && value) {
      options.inputs.push(resolve(value));
      index += 1;
    } else if (argument === "--branch" && value) {
      options.branch = value;
      index += 1;
    } else if (argument === "--report" && value) {
      options.report = value;
      index += 1;
    } else if (argument === "--destination-snapshot" && value) {
      options.destinationSnapshot = resolve(value);
      index += 1;
    } else if (argument === "--out" && value) {
      options.outputDirectory = resolve(value);
      index += 1;
    } else if (argument === "--confirm" && value) {
      options.confirm = value;
      index += 1;
    } else if (argument === "--write-endpoint" && value) {
      options.endpoint = value;
      index += 1;
    } else if (argument === "--branch-id" && value) {
      options.branchId = value;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }
  if (!options.inputs.length) throw new Error("At least one --input file is required");
  return options;
}

export function assertWriteConfirmation(actual: string | undefined, expected: string): void {
  if (actual !== expected) {
    throw new Error(`Write cancelled. Re-run with --write --confirm ${expected}`);
  }
}

export function assertWritablePlan(
  result: MigrationResult,
  branchId: string | undefined,
): asserts branchId is string {
  if (
    !branchId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      branchId,
    )
  ) {
    throw new Error("--branch-id must be a valid destination branch UUID for writes");
  }
  const branchCodes = new Set(result.accepted.map((row) => row.branch_code));
  if (branchCodes.size > 1) {
    throw new Error(
      `Write cancelled. The plan contains multiple branches (${[...branchCodes].join(
        ", ",
      )}); run and confirm one branch at a time.`,
    );
  }
  if (result.accepted.length > 10_000) {
    throw new Error(
      "Write cancelled. The migration endpoint accepts at most 10,000 rows per confirmed plan.",
    );
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const options = parseArguments(argv);
  const branch = options.branch ? normalizeBranch(options.branch) : undefined;
  const reportType = options.report ? normalizeReport(options.report) : undefined;
  if (options.branch && !branch) throw new Error(`Unknown branch: ${options.branch}`);
  if (options.report && !reportType) throw new Error(`Unknown report: ${options.report}`);

  const sources = await Promise.all(options.inputs.map(readLegacySource));
  const destinationKeys = await readDestinationExternalKeys(options.destinationSnapshot);
  const result = buildMigrationResult(
    sources.flatMap((source) => source.rows),
    { branch: branch ?? undefined, reportType: reportType ?? undefined },
    destinationKeys,
  );
  const reportDirectory = await writeMigrationReports(result, options.outputDirectory);

  process.stdout.write(
    [
      `Mode: dry-run`,
      `Rows read: ${result.rows_read}`,
      `Valid unique rows: ${result.rows_accepted}`,
      `Rejected rows: ${result.rows_rejected}`,
      `Duplicates in source: ${result.duplicates_in_source}`,
      `Already in destination: ${result.already_in_destination}`,
      `Rows ready to write: ${result.rows_ready_to_write}`,
      `Reports: ${reportDirectory}`,
      `Confirmation token: ${result.confirmation_token}`,
    ].join("\n") + "\n",
  );

  if (!options.write) return;
  assertWriteConfirmation(options.confirm, result.confirmation_token);
  const endpoint = options.endpoint;
  const accessToken = process.env.SUPABASE_MIGRATION_ACCESS_TOKEN;
  if (!endpoint) {
    throw new Error(
      "--write-endpoint is required for writes; use an audited, authenticated Supabase Edge Function",
    );
  }
  if (!accessToken) {
    throw new Error("SUPABASE_MIGRATION_ACCESS_TOKEN is required for writes");
  }
  assertWritablePlan(result, options.branchId);
  if (!result.accepted.length) {
    process.stdout.write("No new rows to write; destination is already reconciled.\n");
    return;
  }

  const writeSummary = await writeMigration(result, {
    endpoint,
    accessToken,
    branchId: options.branchId,
  });
  result.mode = "write";
  result.write_summary = writeSummary;
  await writeMigrationReports(result, options.outputDirectory);
  process.stdout.write(
    `Write completed: ${writeSummary.inserted} inserted, ${writeSummary.updated} updated, ${writeSummary.skipped} skipped.\n`,
  );
}

const invokedDirectly =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
