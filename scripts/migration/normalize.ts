import { createHash } from "node:crypto";
import type {
  BranchCode,
  CanonicalInventoryRow,
  NormalizeDefaults,
  RawLegacyRow,
  RejectedRow,
  ReportType,
} from "./types";

const BRANCH_ALIASES: Record<string, BranchCode> = {
  GAI: "GAI",
  GAISANO: "GAI",
  "GAISANO ILOILO": "GAI",
  "GAISANO CITY ILOILO": "GAI",
  CAS: "CAS",
  CASA: "CAS",
  "CASA PLAZA": "CAS",
  BAC: "BAC",
  BACOLOD: "BAC",
};

const REPORT_ALIASES: Record<string, ReportType> = {
  STOCK: "stocks",
  STOCKS: "stocks",
  INVENTORY: "stocks",
  AVAILABLE: "stocks",
  SCANRESULT: "sold_out",
  SCANRESULTS: "sold_out",
  "SCAN RESULTS": "sold_out",
  "SOLD OUT": "sold_out",
  SOLDOUT: "sold_out",
  SOLD: "sold_out",
  AUDIT: "audit",
  "RE INVENTORY": "audit",
  REINVENTORY: "audit",
  "RE-INVENTORY": "audit",
  AUDITED: "audit",
};

const COLUMN_ALIASES: Record<string, string[]> = {
  branch: ["branch", "branch code", "location", "store"],
  report: ["report", "report type", "status", "sheet", "dataset"],
  lens_type: ["lens type", "lenstype", "lens", "type"],
  description: ["description", "desc", "item description", "product description", "item"],
  tag: ["tag", "tag no", "tag number", "tag #", "barcode"],
  si: ["si", "si no", "si number", "sales invoice", "sales invoice no", "invoice"],
  inventory_date: ["inventory date", "date", "stock date", "audit date", "sold date"],
  external_key: ["external key", "external_key", "legacy id", "source id"],
};

function comparable(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function cleanText(value: unknown): string | null {
  const valueAsText =
    typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : String(value ?? "").trim();
  return valueAsText === "" ? null : valueAsText;
}

function findValue(values: Record<string, unknown>, canonical: string): unknown {
  const normalized = new Map(
    Object.entries(values).map(([key, value]) => [
      key
        .trim()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .toLowerCase(),
      value,
    ]),
  );
  for (const alias of COLUMN_ALIASES[canonical] ?? [canonical]) {
    if (normalized.has(alias)) return normalized.get(alias);
  }
  return undefined;
}

export function normalizeBranch(value: unknown): BranchCode | null {
  return BRANCH_ALIASES[comparable(value)] ?? null;
}

export function normalizeReport(value: unknown): ReportType | null {
  return REPORT_ALIASES[comparable(value)] ?? null;
}

function inferBranch(row: RawLegacyRow): BranchCode | null {
  const haystack = comparable(`${row.sourceSheet} ${row.sourceFile}`);
  if (/\bGAI\b/.test(haystack) || haystack.includes("GAISANO ILOILO")) return "GAI";
  if (/\bCAS\b/.test(haystack) || haystack.includes("CASA PLAZA")) return "CAS";
  if (/\bBAC\b/.test(haystack) || haystack.includes("BACOLOD")) return "BAC";
  return null;
}

function inferReport(row: RawLegacyRow): ReportType | null {
  const haystack = comparable(`${row.sourceSheet} ${row.sourceFile}`);
  if (haystack.includes("SCANRESULTS") || haystack.includes("SOLD OUT")) return "sold_out";
  if (/\bAUDIT\b/.test(haystack) || haystack.includes("RE INVENTORY")) {
    return "audit";
  }
  if (/\bSTOCKS\b/.test(haystack)) return "stocks";
  return null;
}

export function normalizeDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel's 1900 date system, including its historical leap-year bug.
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
    return Number.isNaN(date.valueOf()) ? null : date.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (isoMatch) {
    const date = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00Z`);
    const normalized = Number.isNaN(date.valueOf()) ? null : date.toISOString().slice(0, 10);
    return normalized === `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
      ? normalized
      : null;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString().slice(0, 10);
}

function externalKeyFor(row: Omit<CanonicalInventoryRow, "external_key">): string {
  const stableIdentity = [
    row.branch_code,
    row.report_type,
    row.lens_type ?? "",
    row.description.toLocaleLowerCase(),
    row.tag?.toLocaleLowerCase() ?? "",
    row.si?.toLocaleLowerCase() ?? "",
    row.inventory_date ?? "",
  ].join("\u001f");
  return `legacy:v1:${createHash("sha256").update(stableIdentity).digest("hex")}`;
}

export function normalizeLegacyRow(
  raw: RawLegacyRow,
  defaults: NormalizeDefaults = {},
): { row?: CanonicalInventoryRow; rejection?: RejectedRow } {
  const reasons: string[] = [];
  const branchValue = findValue(raw.values, "branch");
  const reportValue = findValue(raw.values, "report");
  const branch =
    (branchValue == null || cleanText(branchValue) == null
      ? defaults.branch ?? inferBranch(raw)
      : normalizeBranch(branchValue)) ?? null;
  const reportType =
    (reportValue == null || cleanText(reportValue) == null
      ? defaults.reportType ?? inferReport(raw)
      : normalizeReport(reportValue)) ?? null;

  if (!branch) reasons.push("Unknown or missing branch");
  if (!reportType) reasons.push("Unknown or missing report type");

  const description = cleanText(findValue(raw.values, "description"));
  if (!description) reasons.push("Missing description");
  if (description && description.length > 500) {
    reasons.push("Description exceeds 500 characters");
  }

  const rawDate = findValue(raw.values, "inventory_date");
  const inventoryDate = normalizeDate(rawDate);
  if (cleanText(rawDate) && !inventoryDate) reasons.push("Invalid inventory date");

  const tag = cleanText(findValue(raw.values, "tag"));
  const si = cleanText(findValue(raw.values, "si"));
  const lensType = cleanText(findValue(raw.values, "lens_type"));
  if (!tag && !si) reasons.push("At least one of tag or SI is required");
  if (lensType && lensType.length > 200) reasons.push("Lens type exceeds 200 characters");
  if (tag && tag.length > 200) reasons.push("Tag exceeds 200 characters");
  if (si && si.length > 120) reasons.push("SI exceeds 120 characters");
  const suppliedKey = cleanText(findValue(raw.values, "external_key"));
  if (suppliedKey && suppliedKey.length > 300) {
    reasons.push("External key exceeds 300 characters");
  }

  if (reasons.length || !branch || !reportType || !description) {
    return {
      rejection: {
        source_file: raw.sourceFile,
        source_sheet: raw.sourceSheet,
        source_row_number: raw.sourceRowNumber,
        reasons,
        row: raw.values,
      },
    };
  }

  const rowWithoutKey: Omit<CanonicalInventoryRow, "external_key"> = {
    branch_code: branch,
    report_type: reportType,
    lens_type: lensType,
    description,
    tag,
    si,
    inventory_date: inventoryDate,
    source_row_number: raw.sourceRowNumber,
    source_metadata: {
      legacy_file: raw.sourceFile,
      legacy_sheet: raw.sourceSheet,
      legacy_row: raw.sourceRowNumber,
      source_sha256: raw.sourceSha256,
      migration_version: 1,
    },
  };
  return {
    row: {
      ...rowWithoutKey,
      external_key: suppliedKey ?? externalKeyFor(rowWithoutKey),
    },
  };
}
