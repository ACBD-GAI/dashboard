import { describe, expect, it } from "vitest";
import {
  assertWritablePlan,
  assertWriteConfirmation,
  parseArguments,
} from "../../scripts/migrate-legacy";
import { buildMigrationResult } from "../../scripts/migration/run";
import type { RawLegacyRow } from "../../scripts/migration/types";

describe("legacy migration CLI", () => {
  it("is dry-run by default", () => {
    const options = parseArguments(["--input", "legacy.csv"]);
    expect(options.write).toBe(false);
    expect(options.confirm).toBeUndefined();
  });

  it("only enables writes through an explicit flag and confirmation argument", () => {
    const options = parseArguments([
      "--input",
      "legacy.csv",
      "--write",
      "--confirm",
      "MIGRATE:abc:1",
    ]);
    expect(options.write).toBe(true);
    expect(options.confirm).toBe("MIGRATE:abc:1");
  });

  it("rejects absent or stale confirmation tokens", () => {
    expect(() => assertWriteConfirmation(undefined, "MIGRATE:abc:1")).toThrow(
      "Write cancelled",
    );
    expect(() =>
      assertWriteConfirmation("MIGRATE:stale:1", "MIGRATE:abc:1"),
    ).toThrow("Write cancelled");
    expect(() =>
      assertWriteConfirmation("MIGRATE:abc:1", "MIGRATE:abc:1"),
    ).not.toThrow();
  });

  it("rejects a mixed-branch write plan", () => {
    const sourceRows: RawLegacyRow[] = [
      {
        values: { Branch: "GAI", Report: "stocks", Description: "One", Tag: "T-1" },
        sourceFile: "one.csv",
        sourceSheet: "CSV",
        sourceRowNumber: 2,
        sourceSha256: "a".repeat(64),
      },
      {
        values: { Branch: "CAS", Report: "stocks", Description: "Two", Tag: "T-2" },
        sourceFile: "two.csv",
        sourceSheet: "CSV",
        sourceRowNumber: 2,
        sourceSha256: "b".repeat(64),
      },
    ];
    const result = buildMigrationResult(sourceRows, {});
    expect(() =>
      assertWritablePlan(result, "00000000-0000-4000-8000-000000000001"),
    ).toThrow("multiple branches");
  });
});
