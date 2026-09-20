import { describe, expect, it } from "vitest";
import {
  applyManualQuantity,
  changedPositions,
  clearProductIdentityForManualSku,
  lineAmount,
  nextPositions,
  quantityFromPacking,
} from "./commercialLineItems";

describe("commercial line item model", () => {
  it("reorders with only changed persisted positions", () => {
    const previous = [
      { id: "a", position: 1 },
      { id: "b", position: 2 },
      { id: "c", position: 3 },
    ];
    const next = nextPositions(previous, 0, 1);
    expect(next).toEqual([
      { id: "b", position: 1 },
      { id: "a", position: 2 },
      { id: "c", position: 3 },
    ]);
    expect(changedPositions(previous, next)).toEqual([
      { id: "b", position: 1 },
      { id: "a", position: 2 },
    ]);
  });

  it("offers packing quantity but preserves a manual override", () => {
    expect(quantityFromPacking({ cartons: 3, qty_per_carton: 24 })).toBe(72);
    expect(applyManualQuantity({ cartons: 3, qty_per_carton: 24 }, 70)).toEqual(
      { cartons: 3, qty_per_carton: 24, quantity: 70 },
    );
  });

  it("rounds monetary line amounts and clears stale product identity", () => {
    expect(lineAmount(3, 1.005)).toBe(3.02);
    expect(
      clearProductIdentityForManualSku(
        {
          sanity_product_id: "old",
          sku: "OLD",
          product_snapshot: { image_url: "image" },
        },
        " MANUAL ",
      ),
    ).toEqual({
      sanity_product_id: null,
      sku: "MANUAL",
      product_snapshot: {},
    });
  });
});
