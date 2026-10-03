import { describe, expect, it } from "vitest";
import {
  packingCatalogValues,
  packingColumnKeys,
  packingComputedValues,
} from "./PackingItemsGrid";

describe("packing grid columns", () => {
  it("matches the final 16-column Packing template before actions", () => {
    expect(packingColumnKeys).toEqual([
      "no",
      "sku",
      "name",
      "image",
      "specification",
      "cartons",
      "qty_per_carton",
      "unit",
      "quantity",
      "length_cm",
      "width_cm",
      "height_cm",
      "per_cbm",
      "carton_weight_kg",
      "total_cbm",
      "total_weight",
      "actions",
    ]);
    expect(
      packingComputedValues({
        id: "draft",
        length_cm: 50,
        width_cm: 40,
        height_cm: 30,
        cartons: 2,
        qty_per_carton: 32,
        carton_weight_kg: 12.5,
      }),
    ).toEqual({
      quantity: 64,
      perCbm: "0.060 m³",
      totalCbm: "0.120 m³",
      totalWeight: "25.00 kg",
    });
  });
});

it("initializes a standalone Packing row exclusively from the selected snapshot", () => {
  expect(
    packingCatalogValues({
      sanity_product_id: "sanity-1",
      sku: "DIRECT-1",
      product_snapshot: {
        name: "Saved product",
        image_url: "https://example.com/direct.jpg",
        specification: "Saved specification",
        unit: "PCS",
      },
      packing_snapshot: {
        qty_per_carton: 24,
        length_cm: 50,
        width_cm: 40,
        height_cm: 30,
        carton_weight_kg: 8.5,
      },
    }),
  ).toEqual({
    sanity_product_id: "sanity-1",
    sku: "DIRECT-1",
    product_snapshot: {
      name: "Saved product",
      image_url: "https://example.com/direct.jpg",
      specification: "Saved specification",
      unit: "PCS",
    },
    quantity: 1,
    cartons: 0,
    qty_per_carton: 24,
    length_cm: 50,
    width_cm: 40,
    height_cm: 30,
    carton_weight_kg: 8.5,
  });
});
