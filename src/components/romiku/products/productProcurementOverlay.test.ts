import { describe, expect, it, vi } from "vitest";
import {
  loadProductProcurementOverlay,
  unavailableOverlay,
} from "./productProcurementOverlay";
const products = Array.from({ length: 50 }, (_, index) => ({
  id: `sanity-${index}`,
  sku: `SKU-${index}`,
  skuSort: `SKU-${index}`,
  isPublished: true,
}));
describe("procurement overlay", () => {
  it("reads each overlay resource once for the current page, not once per product", async () => {
    const client = {
      getExtensions: vi
        .fn()
        .mockResolvedValue([
          {
            id: "e",
            sanity_product_id: "sanity-0",
            sku: "SKU-0",
            internal_notes: "note",
          },
        ]),
      getSuppliers: vi
        .fn()
        .mockResolvedValue([
          {
            id: "ps",
            sanity_product_id: "sanity-0",
            sku: "SKU-0",
            supplier_id: "s",
            supplier_name: "供应商",
            preferred: true,
            moq: 10,
            lead_days: 7,
          },
        ]),
      getCosts: vi
        .fn()
        .mockResolvedValue([
          { product_supplier_id: "ps", cost: 2, currency: "USD" },
        ]),
    };
    const overlay = await loadProductProcurementOverlay(products, client);
    expect(client.getExtensions).toHaveBeenCalledTimes(1);
    expect(client.getSuppliers).toHaveBeenCalledTimes(1);
    expect(client.getCosts).toHaveBeenCalledTimes(1);
    expect(overlay.get("sanity-0")).toMatchObject({
      internalNotes: "note",
      supplierCount: 1,
      preferredSupplier: "供应商",
      supplierMoq: 10,
      leadDays: 7,
      referenceCost: { cost: 2, currency: "USD" },
    });
    expect(overlay.get("sanity-49")?.supplierCount).toBe(0);
  });
  it("keeps catalog rows available when overlay loading fails", () =>
    expect(unavailableOverlay(products).get("sanity-0")).toEqual({
      supplierCount: 0,
      unavailable: true,
    }));
  it("excludes inactive historical relations from the active catalog summary", async () => {
    const client = {
      getExtensions: vi.fn().mockResolvedValue([]),
      getSuppliers: vi.fn().mockResolvedValue([{ id: "old", sanity_product_id: "sanity-0", sku: "SKU-0", supplier_id: "s-old", supplier_name: "旧供应商", preferred: false, active: false, qty_per_carton: 99 }]),
      getCosts: vi.fn().mockResolvedValue([]),
    };
    const overlay = await loadProductProcurementOverlay(products.slice(0, 1), client);
    expect(overlay.get("sanity-0")).toMatchObject({ supplierCount: 0 });
    expect(overlay.get("sanity-0")?.preferredSupplier).toBeUndefined();
  });
  it("uses supplier overrides per field while preserving product defaults without a supplier", async () => {
    const client = {
      getExtensions: vi.fn().mockResolvedValue([
        {
          id: "e0",
          sanity_product_id: "sanity-0",
          sku: "SKU-0",
          qty_per_carton: 24,
          length_cm: 50,
          width_cm: 40,
          height_cm: 35,
          carton_weight_kg: 12.5,
        },
        {
          id: "e1",
          sanity_product_id: "sanity-1",
          sku: "SKU-1",
          qty_per_carton: 12,
          length_cm: 30,
        },
      ]),
      getSuppliers: vi
        .fn()
        .mockResolvedValue([
          {
            id: "s1",
            sanity_product_id: "sanity-1",
            sku: "SKU-1",
            supplier_id: "supplier",
            preferred: true,
            qty_per_carton: 20,
          },
        ]),
      getCosts: vi.fn().mockResolvedValue([]),
    };
    const overlay = await loadProductProcurementOverlay(
      products.slice(0, 2),
      client,
    );
    expect(overlay.get("sanity-0")).toMatchObject({
      supplierCount: 0,
      qtyPerCarton: 24,
      lengthCm: 50,
      widthCm: 40,
      heightCm: 35,
      cartonWeightKg: 12.5,
    });
    expect(overlay.get("sanity-1")).toMatchObject({
      supplierCount: 1,
      qtyPerCarton: 20,
      lengthCm: 30,
    });
  });
});
