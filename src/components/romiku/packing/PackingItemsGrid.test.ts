import { describe, expect, it } from "vitest";
import { packingColumnKeys, packingComputedValues } from "./PackingItemsGrid";

describe("packing grid columns", () => {
  it("keeps carton weight after calculated CBM columns", () => {
    expect(packingColumnKeys).toEqual([
      "no",
      "sku",
      "name",
      "image",
      "quantity",
      "cartons",
      "qty_per_carton",
      "length_cm",
      "width_cm",
      "height_cm",
      "per_cbm",
      "total_cbm",
      "carton_weight_kg",
      "total_weight",
    ]);
    expect(
      packingComputedValues({
        length_cm: 50,
        width_cm: 40,
        height_cm: 30,
        cartons: 2,
        carton_weight_kg: 12.5,
      }),
    ).toEqual({
      perCbm: "0.060 m³",
      totalCbm: "0.120 m³",
      totalWeight: "25.00 kg",
    });
  });
});
