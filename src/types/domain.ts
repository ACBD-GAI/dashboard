export type UserRole = "admin" | "staff" | "viewer";
export type ReportType = "stocks" | "sold_out" | "audit";
export type JobStatus =
  | "pending"
  | "running"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | "cancelled";

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  role: UserRole;
  active: boolean;
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface InventoryItem {
  id: string;
  branch_id?: string;
  branch_code: string;
  branch_name: string;
  report_type: ReportType;
  lens_type: string | null;
  description: string;
  tag: string;
  si: string | null;
  inventory_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryPage {
  rows: InventoryItem[];
  total: number;
}

export interface InventorySummary {
  available: number;
  soldOut: number;
  audited: number;
}

export interface BackgroundJob {
  id: string;
  branch_id: string;
  branch_code?: string;
  status: JobStatus;
  rows_read?: number;
  rows_inserted?: number;
  rows_updated?: number;
  rows_skipped?: number;
  rows_rejected?: number;
  error_message?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface InventoryFilters {
  branchCode: string;
  reportType: ReportType;
  search: string;
  page: number;
  pageSize: number;
}
