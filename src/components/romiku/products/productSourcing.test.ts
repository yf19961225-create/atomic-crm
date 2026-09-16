import { describe, expect, it } from "vitest";

import {
  toProductExtensionWrite,
  toProductSupplierWrite,
  toProcurementCostWrite,
  isProductSupplierDuplicateError,
} from "./productSourcing";

describe("product sourcing writes", () => {
  it("persists CRM-only product extensions without a duplicate product master payload", () => {
    expect(
      toProductExtensionWrite({
        sku: "RMK-100",
        sanity_product_id: "sanity-product-100",
        _sanity_verified: true,
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

  it("drops unverified Sanity identity fields from product-supplier writes", () => {
    expect(
      toProductSupplierWrite({
        sku: "RMK-100",
        supplier_id: "supplier-a",
        sanity_product_id: "typed-by-user",
      }),
    ).not.toHaveProperty("sanity_product_id");
  });

  it("does not persist a manually entered Product Extension identity", () => {
    expect(
      toProductExtensionWrite({
        sku: "RMK-100",
        sanity_product_id: "typed-by-user",
      }),
    ).not.toHaveProperty("sanity_product_id");
  });

  it("recognizes the join uniqueness conflict so duplicate sourcing is safe to surface", () => {
    expect(isProductSupplierDuplicateError({ code: "23505" })).toBe(true);
    expect(
      isProductSupplierDuplicateError(
        new Error("sku,supplier_id unique violation"),
      ),
    ).toBe(true);
    expect(isProductSupplierDuplicateError({ code: "23503" })).toBe(false);
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
