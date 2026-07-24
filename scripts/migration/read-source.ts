import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
import { readFile } from "node:fs/promises";
import type { RawLegacyRow } from "./types";
import { normalizeBranch, normalizeReport } from "./normalize";

export interface ReadSourceResult {
  sha256: string;
  rows: RawLegacyRow[];
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("CSV has an unterminated quoted field");
  if (field !== "" || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((cell) => cell.trim() !== ""));
}

function fromMatrix(
  matrix: unknown[][],
  sourceFile: string,
  sourceSheet: string,
  sourceSha256: string,
): RawLegacyRow[] {
  if (!matrix.length) return [];
  const headers = matrix[0].map((header, index) => {
    const text = String(header ?? "").replace(/^\uFEFF/, "").trim();
    return text || `column_${index + 1}`;
  });
  return matrix.slice(1).flatMap((cells, index) => {
    if (!cells.some((cell) => String(cell ?? "").trim() !== "")) return [];
    return [
      {
        values: Object.fromEntries(headers.map((header, column) => [header, cells[column]])),
        sourceFile,
        sourceSheet,
        sourceRowNumber: index + 2,
        sourceSha256,
      },
    ];
  });
}

export async function readLegacySource(filePath: string): Promise<ReadSourceResult> {
  const bytes = await readFile(filePath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const sourceFile = basename(filePath);
  const extension = extname(filePath).toLowerCase();

  if (extension === ".csv") {
    const matrix = parseCsv(bytes.toString("utf8"));
    return {
      sha256,
      rows: fromMatrix(matrix, sourceFile, "CSV", sha256),
    };
  }
  if (extension === ".xlsx" || extension === ".xls") {
    let xlsx: typeof import("xlsx");
    try {
      xlsx = await import("xlsx");
    } catch {
      throw new Error(
        "Excel input requires the `xlsx` package. Install dependencies or use a CSV export.",
      );
    }
    const workbook = xlsx.read(bytes, { type: "buffer", cellDates: true, raw: true });
    return {
      sha256,
      rows: workbook.SheetNames.flatMap((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const matrix = xlsx.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          raw: true,
          defval: "",
        });
        return fromMatrix(matrix, sourceFile, sheetName, sha256);
      }),
    };
  }
  throw new Error(`Unsupported input extension "${extension}". Use .csv, .xlsx, or .xls.`);
}

export async function readDestinationExternalKeys(
  filePath?: string,
): Promise<Set<string> | undefined> {
  if (!filePath) return undefined;
  const { rows } = await readLegacySource(filePath);
  const keys = new Set<string>();
  for (const row of rows) {
    let externalKey = "";
    let branch = "";
    let report = "";
    for (const [header, value] of Object.entries(row.values)) {
      const canonicalHeader = header
        .trim()
        .replace(/[\s-]+/g, "_")
        .toLowerCase();
      if (canonicalHeader === "external_key") externalKey = String(value ?? "").trim();
      if (canonicalHeader === "branch" || canonicalHeader === "branch_code") {
        branch = normalizeBranch(value) ?? "";
      }
      if (canonicalHeader === "report" || canonicalHeader === "report_type") {
        report = normalizeReport(value) ?? "";
      }
    }
    if (externalKey) {
      keys.add(
        branch && report
          ? `${branch}\u001f${report}\u001f${externalKey}`
          : `*\u001f*\u001f${externalKey}`,
      );
    }
  }
  return keys;
}
