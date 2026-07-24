import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "../lib/supabase/client";
import { getInventoryPage, getInventorySummary } from "./inventory";

vi.mock("../lib/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));

const rpc = vi.mocked(supabase.rpc);

describe("inventory RPC adapters", () => {
  beforeEach(() => rpc.mockReset());

  it("maps the JSON inventory_page contract", async () => {
    rpc.mockResolvedValue({
      data: {
        items: [
          {
            id: "item",
            branch_code: "GAI",
            branch_name: "Gaisano Iloilo",
            report_type: "stocks",
            lens_type: "Single Vision",
            description: "Frame",
            tag: "TAG-1",
            si: null,
            inventory_date: "2026-07-24",
            created_at: "2026-07-24T00:00:00Z",
            updated_at: "2026-07-24T00:00:00Z",
          },
        ],
        total: 41,
        page: 2,
        pageSize: 20,
      },
      error: null,
    } as never);

    const result = await getInventoryPage({
      branchCode: "GAI",
      reportType: "stocks",
      search: "Frame",
      page: 2,
      pageSize: 20,
    });
    expect(result.total).toBe(41);
    expect(result.rows[0].tag).toBe("TAG-1");
  });

  it("maps the camel-case inventory_summary contract", async () => {
    rpc.mockResolvedValue({
      data: { available: 10, soldOut: 4, audited: 2, showing: 16 },
      error: null,
    } as never);
    await expect(getInventorySummary("", "")).resolves.toEqual({
      available: 10,
      soldOut: 4,
      audited: 2,
    });
  });
});
