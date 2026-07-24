import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archiveInventoryItem,
  getInventoryPage,
  getInventorySummary,
  listAuthorizedBranches,
  updateInventorySi,
} from "../../services/inventory";
import type { InventoryFilters } from "../../types/domain";

export const inventoryKeys = {
  all: ["inventory"] as const,
  page: (filters: InventoryFilters) => [...inventoryKeys.all, "page", filters] as const,
  summary: (branch: string, search: string) =>
    [...inventoryKeys.all, "summary", branch, search] as const,
};

export function useBranches() {
  return useQuery({ queryKey: ["branches"], queryFn: listAuthorizedBranches });
}

export function useInventoryPage(filters: InventoryFilters) {
  return useQuery({
    queryKey: inventoryKeys.page(filters),
    queryFn: () => getInventoryPage(filters),
    placeholderData: keepPreviousData,
  });
}

export function useInventorySummary(branch: string, search: string) {
  return useQuery({
    queryKey: inventoryKeys.summary(branch, search),
    queryFn: () => getInventorySummary(branch, search),
  });
}

export function useUpdateSi() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, si }: { id: string; si: string }) =>
      updateInventorySi(id, si),
    onSuccess: () => client.invalidateQueries({ queryKey: inventoryKeys.all }),
  });
}

export function useArchiveItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: archiveInventoryItem,
    onSuccess: () => client.invalidateQueries({ queryKey: inventoryKeys.all }),
  });
}
