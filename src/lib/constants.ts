import type { ReportType } from "../types/domain";

export const REPORT_OPTIONS: ReadonlyArray<{
  value: ReportType;
  label: string;
}> = [
  { value: "stocks", label: "Stocks" },
  { value: "sold_out", label: "Sold Out" },
  { value: "audit", label: "Re-Inventory" },
];

export const PAGE_SIZE = 20;
export const MAX_IMPORT_SIZE_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_IMPORT_EXTENSIONS = [".xlsx", ".xls"] as const;

export const ROLE_LABELS = {
  admin: "Administrator",
  staff: "Staff",
  viewer: "Viewer",
} as const;
