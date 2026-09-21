import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ from: state.from }),
}));

import { createSupabaseProductDrawerClient } from "./supabaseProductDrawerClient";

describe("createSupabaseProductDrawerClient", () => {
  beforeEach(() => {
    state.from.mockReset();
  });

  it("keeps the joined supplier name when PostgREST returns a to-one relation object", async () => {
    const or = vi.fn().mockResolvedValue({
      data: [
        {
          id: "product-supplier-1",
          supplier_id: "supplier-1",
          romiku_suppliers: { name: "Preview Acceptance Supplier" },
        },
      ],
      error: null,
    });
    const select = vi.fn().mockReturnValue({ or });
    state.from.mockReturnValue({ select });

    const suppliers = await createSupabaseProductDrawerClient().getSuppliers({
      id: "sanity-1",
      sku: "SKU-1",
    });

    expect(suppliers).toEqual([
      expect.objectContaining({
        supplier_id: "supplier-1",
        supplier_name: "Preview Acceptance Supplier",
      }),
    ]);
  });
});
