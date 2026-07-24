import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as xlsx from "xlsx";
import {
  readDestinationExternalKeys,
  readLegacySource,
} from "../../scripts/migration/read-source";
import { buildMigrationResult } from "../../scripts/migration/run";
import { writeMigrationReports } from "../../scripts/migration/reports";
import { writeMigration } from "../../scripts/migration/write";

const fixture = resolve("tests/fixtures/legacy-inventory.csv");
const destinationFixture = resolve("tests/fixtures/destination-snapshot.csv");

describe("migration dry run", () => {
  it("reads every non-empty worksheet in an Excel workbook", async () => {
    const directory = await mkdtemp(join(tmpdir(), "acebedo-xlsx-"));
    const workbookPath = join(directory, "legacy.xlsx");
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(
      workbook,
      xlsx.utils.aoa_to_sheet([
        ["Description", "Tag"],
        ["Frame One", "T-1"],
      ]),
      "GAI stocks",
    );
    xlsx.utils.book_append_sheet(
      workbook,
      xlsx.utils.aoa_to_sheet([
        ["Description", "SI"],
        ["Frame Two", "SI-2"],
      ]),
      "CAS SCANRESULTS",
    );
    await writeFile(workbookPath, xlsx.write(workbook, { type: "buffer", bookType: "xlsx" }));

    const source = await readLegacySource(workbookPath);
    const result = buildMigrationResult(source.rows, {});

    expect(result.rows_read).toBe(2);
    expect(result.accepted).toEqual([
      expect.objectContaining({ branch_code: "GAI", report_type: "stocks" }),
      expect.objectContaining({ branch_code: "CAS", report_type: "sold_out" }),
    ]);
  });

  it("parses quoted CSV, rejects invalid rows, and detects duplicate rows", async () => {
    const source = await readLegacySource(fixture);
    const result = buildMigrationResult(source.rows, {}, undefined, "2026-07-24T00:00:00Z");

    expect(result.rows_read).toBe(6);
    expect(result.rows_accepted).toBe(3);
    expect(result.rows_rejected).toBe(2);
    expect(result.duplicates_in_source).toBe(1);
    expect(result.rows_ready_to_write).toBe(3);
    expect(result.accepted[0]).toMatchObject({
      branch_code: "GAI",
      report_type: "stocks",
      description: "Frame, Blue",
    });
    expect(result.confirmation_token).toMatch(/^MIGRATE:[a-f0-9]{12}:3$/);
  });

  it("is idempotency-aware against destination external keys", async () => {
    const source = await readLegacySource(fixture);
    const initial = buildMigrationResult(source.rows, {});
    const destinationKeys = new Set([initial.accepted[0].external_key]);
    const replay = buildMigrationResult(source.rows, {}, destinationKeys);

    expect(replay.rows_accepted).toBe(3);
    expect(replay.already_in_destination).toBe(1);
    expect(replay.rows_ready_to_write).toBe(2);
    expect(replay.destination_snapshot_count).toBe(1);
    expect(replay.destination_count_after_expected).toBe(3);
  });

  it("reads legacy destination snapshots that only expose external_key", async () => {
    const keys = await readDestinationExternalKeys(destinationFixture);
    expect(keys).toEqual(
      new Set(["*\u001f*\u001flegacy:v1:not-a-match"]),
    );
  });

  it("writes machine-readable reconciliation and row-level reports", async () => {
    const source = await readLegacySource(fixture);
    const result = buildMigrationResult(source.rows, {});
    const directory = await mkdtemp(join(tmpdir(), "acebedo-migration-"));

    await writeMigrationReports(result, directory);

    const reconciliation = JSON.parse(
      await readFile(join(directory, "reconciliation.json"), "utf8"),
    );
    const rejectedCsv = await readFile(join(directory, "rejected.csv"), "utf8");
    expect(reconciliation).toMatchObject({
      rows_read: 6,
      rows_rejected: 2,
      duplicates_in_source: 1,
      rows_ready_to_write: 3,
    });
    expect(rejectedCsv).toContain("Unknown or missing branch");
    expect(rejectedCsv).toContain("Duplicate of legacy-inventory.csv/CSV row 2");
  });
});

describe("secure write adapter", () => {
  it("sends an idempotency key and bearer token without embedding credentials", async () => {
    const source = await readLegacySource(fixture);
    const result = buildMigrationResult(source.rows, {});
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ inserted: 3, updated: 0, skipped: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const summary = await writeMigration(result, {
      endpoint: "https://example.invalid/functions/v1/migrate",
      accessToken: "test-access-token",
      branchId: "00000000-0000-4000-8000-000000000001",
    });

    expect(summary.inserted).toBe(3);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.invalid/functions/v1/migrate",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-access-token",
          "Idempotency-Key": result.fingerprint,
        }),
      }),
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      branchId: "00000000-0000-4000-8000-000000000001",
      sourceFingerprint: result.fingerprint,
      confirm: true,
    });
    fetchMock.mockRestore();
  });
});
