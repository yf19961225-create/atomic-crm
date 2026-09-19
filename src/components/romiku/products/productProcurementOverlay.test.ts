import { describe, expect, it, vi } from "vitest";
import { loadProductProcurementOverlay, unavailableOverlay } from "./productProcurementOverlay";
const products = Array.from({ length: 50 }, (_, index) => ({ id: `sanity-${index}`, sku: `SKU-${index}`, skuSort: `SKU-${index}`, isPublished: true }));
describe("procurement overlay", () => {
  it("reads each overlay resource once for the current page, not once per product", async () => {
    const client = { getExtensions: vi.fn().mockResolvedValue([{ id: "e", sanity_product_id: "sanity-0", sku: "SKU-0", internal_notes: "note" }]), getSuppliers: vi.fn().mockResolvedValue([{ id: "ps", sanity_product_id: "sanity-0", sku: "SKU-0", supplier_id: "s", supplier_name: "供应商", preferred: true, moq: 10, lead_days: 7 }]), getCosts: vi.fn().mockResolvedValue([{ product_supplier_id: "ps", cost: 2, currency: "USD" }]) };
    const overlay = await loadProductProcurementOverlay(products, client);
    expect(client.getExtensions).toHaveBeenCalledTimes(1); expect(client.getSuppliers).toHaveBeenCalledTimes(1); expect(client.getCosts).toHaveBeenCalledTimes(1);
    expect(overlay.get("sanity-0")).toMatchObject({ internalNotes: "note", supplierCount: 1, preferredSupplier: "供应商", supplierMoq: 10, leadDays: 7, referenceCost: { cost: 2, currency: "USD" } });
    expect(overlay.get("sanity-49")?.supplierCount).toBe(0);
  });
  it("keeps catalog rows available when overlay loading fails", () => expect(unavailableOverlay(products).get("sanity-0")).toEqual({ supplierCount: 0, unavailable: true }));
});
