import { describe, expect, it, vi } from "vitest";
import {
  addCostHistory,
  saveInternalNotes,
  saveSupplier,
  type ProductDrawerClient,
} from "./productDrawerActions";

const product = { id: "sanity-1", sku: "RMK-100" };
const client = (): ProductDrawerClient => ({
  createExtension: vi.fn().mockResolvedValue({ id: "extension-1" }),
  updateExtension: vi.fn(),
  createSupplier: vi.fn().mockResolvedValue({ id: "supplier-link-1" }),
  updateSupplier: vi.fn(),
  createCost: vi.fn(),
});

describe("Product Drawer writes", () => {
  it("creates the minimum verified Extension on the first Sanity-only internal note save", async () => {
    const writes = client();
    const refresh = vi.fn();
    await saveInternalNotes(
      writes,
      product,
      undefined,
      "Handle with care",
      refresh,
    );
    expect(writes.createExtension).toHaveBeenCalledWith({
      sku: "RMK-100",
      sanity_product_id: "sanity-1",
      internal_notes: "Handle with care",
    });
    expect(refresh).toHaveBeenCalledWith([product]);
  });
  it("creates and edits a supplier link without requiring an Extension", async () => {
    const writes = client();
    const refresh = vi.fn();
    await saveSupplier(
      writes,
      product,
      { supplier_id: "supplier-a", preferred: true, moq: 100, lead_days: 12 },
      refresh,
    );
    await saveSupplier(
      writes,
      product,
      { id: "link-1", supplier_id: "supplier-a", preferred: false, moq: 80 },
      refresh,
    );
    expect(writes.createSupplier).toHaveBeenCalledWith(
      expect.objectContaining({
        sku: "RMK-100",
        sanity_product_id: "sanity-1",
        supplier_id: "supplier-a",
      }),
    );
    expect(writes.updateSupplier).toHaveBeenCalledWith(
      "link-1",
      expect.objectContaining({ moq: 80 }),
    );
  });
  it("appends reference cost history only to the selected supplier link", async () => {
    const writes = client();
    await addCostHistory(writes, "link-1", {
      cost: 3.5,
      currency: "usd",
      effective_date: "2026-09-19",
      source_type: "quote",
    });
    expect(writes.createCost).toHaveBeenCalledWith({
      product_supplier_id: "link-1",
      cost: 3.5,
      currency: "USD",
      effective_date: "2026-09-19",
      source_type: "quote",
    });
  });
});
