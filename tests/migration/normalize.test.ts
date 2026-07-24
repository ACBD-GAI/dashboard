import { describe, expect, it } from "vitest";
import {
  normalizeBranch,
  normalizeDate,
  normalizeLegacyRow,
  normalizeReport,
} from "../../scripts/migration/normalize";
import type { RawLegacyRow } from "../../scripts/migration/types";

function raw(values: Record<string, unknown>): RawLegacyRow {
  return {
    values,
    sourceFile: "legacy.csv",
    sourceSheet: "CSV",
    sourceRowNumber: 2,
    sourceSha256: "a".repeat(64),
  };
}

describe("legacy value normalization", () => {
  it.each([
    ["GAI", "GAI"],
    ["Gaisano Iloilo", "GAI"],
    ["Casa Plaza", "CAS"],
    ["bacolod", "BAC"],
  ])("normalizes branch %s", (input, expected) => {
    expect(normalizeBranch(input)).toBe(expected);
  });

  it.each([
    ["stocks", "stocks"],
    ["SCANRESULTS", "sold_out"],
    ["Sold Out", "sold_out"],
    ["AUDIT", "audit"],
    ["Re-Inventory", "audit"],
  ])("normalizes report %s", (input, expected) => {
    expect(normalizeReport(input)).toBe(expected);
  });

  it("normalizes Excel serial and ISO dates", () => {
    expect(normalizeDate(45_474)).toBe("2024-07-01");
    expect(normalizeDate("2026-07-03")).toBe("2026-07-03");
    expect(normalizeDate("2026-02-31")).toBeNull();
  });

  it("uses defaults for absent branch and report columns", () => {
    const result = normalizeLegacyRow(
      raw({ Description: "Frame", Tag: "T-1", Date: "2026-07-01" }),
      { branch: "GAI", reportType: "stocks" },
    );
    expect(result.rejection).toBeUndefined();
    expect(result.row).toMatchObject({
      branch_code: "GAI",
      report_type: "stocks",
      description: "Frame",
      tag: "T-1",
      inventory_date: "2026-07-01",
    });
  });

  it("rejects missing identity, description, and invalid classifications", () => {
    const result = normalizeLegacyRow(
      raw({ Branch: "Nowhere", Report: "Mystery", Description: "", Tag: "", SI: "" }),
    );
    expect(result.row).toBeUndefined();
    expect(result.rejection?.reasons).toEqual([
      "Unknown or missing branch",
      "Unknown or missing report type",
      "Missing description",
      "At least one of tag or SI is required",
    ]);
  });

  it("rejects values that the secure endpoint would otherwise truncate", () => {
    const result = normalizeLegacyRow(
      raw({
        Branch: "GAI",
        Report: "stocks",
        Description: "x".repeat(501),
        Tag: "T-1",
        SI: "s".repeat(121),
      }),
    );
    expect(result.rejection?.reasons).toEqual([
      "Description exceeds 500 characters",
      "SI exceeds 120 characters",
    ]);
  });

  it("generates the same external key for semantically identical records", () => {
    const first = normalizeLegacyRow(
      raw({
        Branch: "GAI",
        Report: "stocks",
        Description: " Blue Frame ",
        Tag: "TAG-1",
      }),
    ).row;
    const second = normalizeLegacyRow(
      raw({
        Branch: "Gaisano Iloilo",
        Report: "available",
        Description: "blue frame",
        Tag: "tag-1",
      }),
    ).row;
    expect(first?.external_key).toBe(second?.external_key);
  });
});
