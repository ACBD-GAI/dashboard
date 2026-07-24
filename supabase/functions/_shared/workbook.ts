import * as XLSX from "xlsx";
import { HttpError } from "./http.ts";

export type ReportType = "stocks" | "sold_out" | "audit";
export type CanonicalRow = {
  report_type: ReportType;
  lens_type: string | null;
  description: string;
  tag: string | null;
  si: string | null;
  inventory_date: string | null;
  external_key: string;
  source_row_number: number;
  source_metadata: Record<string, unknown>;
};
export type RowError = { row: number; field: string; message: string };

const HEADER_ALIASES: Record<string, string[]> = {
  description: [
    "description",
    "item description",
    "product description",
    "desc",
  ],
  tag: ["tag", "tag no", "tag number", "tag #"],
  si: ["si", "si no", "si number", "sales invoice", "sales invoice no"],
  lens_type: ["lens type", "lenstype", "lens"],
  inventory_date: ["inventory date", "date", "stock date"],
  report_type: ["report", "report type", "status", "sheet"],
  external_key: ["external key", "source key", "key"],
};

function normalizedHeader(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function getField(row: Record<string, unknown>, field: string): unknown {
  const aliases = HEADER_ALIASES[field] ?? [field];
  const entry = Object.entries(row).find(([key]) =>
    aliases.includes(normalizedHeader(key))
  );
  return entry?.[1];
}

function optionalText(value: unknown, max = 500): string | null {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
}

export function normalizeReport(
  value: unknown,
  fallback: ReportType = "stocks",
): ReportType {
  const normalized = normalizedHeader(value);
  if (!normalized) return fallback;
  if (normalized === "stocks" || normalized === "stock") return "stocks";
  if (
    ["scanresults", "scan results", "sold out", "soldout", "sold_out"].includes(
      normalized,
    )
  ) return "sold_out";
  if (
    ["audit", "re inventory", "reinventory", "re_inventory"].includes(
      normalized,
    )
  ) return "audit";
  throw new HttpError(400, `Unsupported report type: ${String(value)}`);
}

function excelDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return `${parsed.y.toString().padStart(4, "0")}-${
      parsed.m.toString().padStart(2, "0")
    }-${parsed.d.toString().padStart(2, "0")}`;
  }
  const text = String(value).trim();
  const date = new Date(text);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString().slice(0, 10);
}

async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function fileSha256(bytes: Uint8Array): Promise<string> {
  return await sha256(bytes);
}

export async function parseInventoryWorkbook(
  bytes: Uint8Array,
  fallbackReport: ReportType = "stocks",
): Promise<{ rows: CanonicalRow[]; errors: RowError[]; rowsRead: number }> {
  let workbook: ReturnType<typeof XLSX.read>;
  try {
    workbook = XLSX.read(bytes, { type: "array", cellDates: true });
  } catch {
    throw new HttpError(422, "The workbook could not be parsed");
  }
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new HttpError(422, "The workbook has no worksheets");
  const rawRows = XLSX.utils.sheet_to_json(
    workbook.Sheets[firstSheet],
    { defval: null, raw: true },
  ) as Record<string, unknown>[];
  if (rawRows.length > 10_000) {
    throw new HttpError(413, "A workbook may contain at most 10,000 data rows");
  }

  const rows: CanonicalRow[] = [];
  const errors: RowError[] = [];
  for (let index = 0; index < rawRows.length; index += 1) {
    const source = rawRows[index];
    const rowNumber = index + 2;
    const description = optionalText(getField(source, "description"), 500);
    if (!description) {
      errors.push({
        row: rowNumber,
        field: "description",
        message: "Description is required",
      });
      continue;
    }

    let reportType: ReportType;
    try {
      reportType = normalizeReport(
        getField(source, "report_type"),
        fallbackReport,
      );
    } catch (error) {
      errors.push({
        row: rowNumber,
        field: "report_type",
        message: error instanceof Error ? error.message : "Invalid report type",
      });
      continue;
    }
    const rawDate = getField(source, "inventory_date");
    const inventoryDate = excelDate(rawDate);
    if (
      rawDate !== null && rawDate !== undefined && rawDate !== "" &&
      !inventoryDate
    ) {
      errors.push({
        row: rowNumber,
        field: "inventory_date",
        message: "Invalid inventory date",
      });
      continue;
    }
    const tag = optionalText(getField(source, "tag"), 200);
    const si = optionalText(getField(source, "si"), 120);
    const lensType = optionalText(getField(source, "lens_type"), 200);
    const suppliedKey = optionalText(getField(source, "external_key"), 300);
    const semanticKey = await sha256(
      [reportType, tag ?? "", si ?? "", description].join("\u001f")
        .toLowerCase(),
    );
    rows.push({
      report_type: reportType,
      lens_type: lensType,
      description,
      tag,
      si,
      inventory_date: inventoryDate,
      external_key: suppliedKey ?? `sha256:${semanticKey}`,
      source_row_number: rowNumber,
      source_metadata: { worksheet: firstSheet },
    });
  }
  return { rows, errors, rowsRead: rawRows.length };
}

export function createErrorWorkbook(errors: RowError[]): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(errors.map((error) => ({
    "Source Row": error.row,
    "Field": error.field,
    "Error": error.message,
  })));
  XLSX.utils.book_append_sheet(workbook, worksheet, "Validation Errors");
  return XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  }) as Uint8Array;
}

export function createExportWorkbook(
  branch: { code: string; name: string },
  records: Array<Record<string, unknown>>,
): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const grouped: Record<ReportType, Array<Record<string, unknown>>> = {
    stocks: [],
    sold_out: [],
    audit: [],
  };
  for (const record of records) {
    grouped[record.report_type as ReportType].push({
      "Branch Code": branch.code,
      "Branch Name": branch.name,
      "Report Type": record.report_type,
      "Lens Type": record.lens_type ?? "",
      "Description": record.description,
      "Tag": record.tag ?? "",
      "SI": record.si ?? "",
      "Inventory Date": record.inventory_date ?? "",
      "Created At": record.created_at,
      "Updated At": record.updated_at,
    });
  }
  const names: Record<ReportType, string> = {
    stocks: "Stocks",
    sold_out: "Sold Out",
    audit: "Re-Inventory",
  };
  for (const report of Object.keys(grouped) as ReportType[]) {
    if (grouped[report].length > 0) {
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(grouped[report]),
        names[report],
      );
    }
  }
  if (workbook.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["No inventory records matched this export."]]),
      "Inventory",
    );
  }
  return XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  }) as Uint8Array;
}
