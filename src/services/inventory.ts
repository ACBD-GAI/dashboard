import { supabase } from "../lib/supabase/client";
import type {
  Branch,
  InventoryFilters,
  InventoryItem,
  InventoryPage,
  InventorySummary,
} from "../types/domain";

export async function listAuthorizedBranches(): Promise<Branch[]> {
  const { data, error } = await supabase
    .from("branches")
    .select("id,code,name,active")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []) as Branch[];
}

export async function getInventoryPage(
  filters: InventoryFilters,
): Promise<InventoryPage> {
  const { data, error } = await supabase.rpc("inventory_page", {
    p_branch_code: filters.branchCode || null,
    p_report_type: filters.reportType,
    p_search: filters.search || null,
    p_page: filters.page,
    p_page_size: filters.pageSize,
  });
  if (error) throw error;
  const result = (data ?? {}) as {
    items?: InventoryItem[];
    total?: number | string;
  };
  return {
    rows: result.items ?? [],
    total: Number(result.total ?? 0),
  };
}

interface SummaryResult {
  available: number | string;
  soldOut: number | string;
  audited: number | string;
}

export async function getInventorySummary(
  branchCode: string,
  search: string,
): Promise<InventorySummary> {
  const { data, error } = await supabase.rpc("inventory_summary", {
    p_branch_code: branchCode || null,
    p_search: search || null,
  });
  if (error) throw error;
  const result = (data ?? {}) as Partial<SummaryResult>;
  return {
    available: Number(result?.available ?? 0),
    soldOut: Number(result?.soldOut ?? 0),
    audited: Number(result?.audited ?? 0),
  };
}

export async function updateInventorySi(id: string, si: string) {
  const { error } = await supabase.rpc("update_inventory_si", {
    p_item_id: id,
    p_si: si || null,
  });
  if (error) throw error;
}

export async function archiveInventoryItem(id: string) {
  const { error } = await supabase.rpc("archive_inventory_item", {
    p_item_id: id,
  });
  if (error) throw error;
}
