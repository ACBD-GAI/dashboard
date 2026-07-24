export const BRANCH_CODES = ["GAI", "CAS", "BAC"] as const;
export const REPORT_TYPES = ["stocks", "sold_out", "audit"] as const;

export type BranchCode = (typeof BRANCH_CODES)[number];
export type ReportType = (typeof REPORT_TYPES)[number];

export interface RawLegacyRow {
  values: Record<string, unknown>;
  sourceFile: string;
  sourceSheet: string;
  sourceRowNumber: number;
  sourceSha256: string;
}

export interface CanonicalInventoryRow {
  branch_code: BranchCode;
  report_type: ReportType;
  lens_type: string | null;
  description: string;
  tag: string | null;
  si: string | null;
  inventory_date: string | null;
  external_key: string;
  source_row_number: number;
  source_metadata: {
    legacy_file: string;
    legacy_sheet: string;
    legacy_row: number;
    source_sha256: string;
    migration_version: 1;
  };
}

export interface RejectedRow {
  source_file: string;
  source_sheet: string;
  source_row_number: number;
  reasons: string[];
  row: Record<string, unknown>;
}

export interface SourceStats {
  file: string;
  sha256: string;
  rows_read: number;
  rows_accepted: number;
  rows_rejected: number;
}

export interface MigrationResult {
  mode: "dry-run" | "write";
  fingerprint: string;
  confirmation_token: string;
  generated_at: string;
  rows_read: number;
  rows_accepted: number;
  rows_rejected: number;
  duplicates_in_source: number;
  already_in_destination: number;
  rows_ready_to_write: number;
  destination_snapshot_count: number | null;
  destination_count_after_expected: number | null;
  sources: SourceStats[];
  accepted: CanonicalInventoryRow[];
  rejected: RejectedRow[];
  duplicate_rows: RejectedRow[];
  already_present: CanonicalInventoryRow[];
  write_summary?: {
    inserted: number;
    updated: number;
    skipped: number;
    destination_count_after: number | null;
  };
}

export interface NormalizeDefaults {
  branch?: BranchCode;
  reportType?: ReportType;
}
