import { describe, expect, it } from "vitest";

import {
  toProductExtensionWrite,
  toProductSupplierWrite,
  toProcurementCostWrite,
} from "./productSourcing";

describe("product sourcing writes", () => {
  it("persists CRM-only product extensions without a duplicate product master payload", () => {
    expect(
      toProductExtensionWrite({
        sku: "RMK-100",
        sanity_product_id: "sanity-product-100",
        internal_notes: "Use kraft gift box.",
      }),
    ).toEqual({
      sku: "RMK-100",
      sanity_product_id: "sanity-product-100",
      internal_notes: "Use kraft gift box.",
    });
  });

  it("keeps one supplier link per SKU and supplier, allowing the same SKU to be sourced by multiple suppliers", () => {
    const firstSupplier = toProductSupplierWrite({
      sku: "RMK-100",
      sanity_product_id: "sanity-product-100",
      supplier_id: "supplier-a",
      moq: 250,
    });
    const secondSupplier = toProductSupplierWrite({
      sku: "RMK-100",
      sanity_product_id: "sanity-product-100",
      supplier_id: "supplier-b",
      moq: 500,
    });

    expect(firstSupplier).toMatchObject({
      sku: "RMK-100",
      supplier_id: "supplier-a",
      moq: 250,
    });
    expect(secondSupplier).toMatchObject({
      sku: "RMK-100",
      supplier_id: "supplier-b",
      moq: 500,
    });
    expect(firstSupplier).not.toEqual(secondSupplier);
  });

  it("normalizes a reference cost history write without putting cost columns on the product master", () => {
    expect(
      toProcurementCostWrite({
        product_supplier_id: "link-1",
        cost: 12.5,
        currency: "USD",
        effective_date: "2026-09-16",
        source_type: "supplier_quote",
      }),
    ).toEqual({
      product_supplier_id: "link-1",
      cost: 12.5,
      currency: "USD",
      effective_date: "2026-09-16",
      source_type: "supplier_quote",
      source_note: null,
    });
  });
});
