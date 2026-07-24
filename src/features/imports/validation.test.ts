import { describe, expect, it } from "vitest";
import { validateImportFile } from "./validation";

describe("validateImportFile", () => {
  it("accepts legacy and modern Excel extensions case-insensitively", () => {
    expect(validateImportFile({ name: "stocks.XLSX", size: 1024 })).toBeNull();
    expect(validateImportFile({ name: "stocks.xls", size: 1024 })).toBeNull();
  });

  it("rejects unsupported and oversized files", () => {
    expect(validateImportFile({ name: "stocks.csv", size: 1024 })).toMatch(/Only/);
    expect(validateImportFile({ name: "stocks.xlsx", size: 11 * 1024 * 1024 })).toMatch(
      /10 MB/,
    );
  });
});
