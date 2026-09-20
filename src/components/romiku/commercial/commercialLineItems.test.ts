import { describe, expect, it } from "vitest";
import {
  applyManualQuantity,
  changedPositions,
  clearProductIdentityForManualSku,
  commitCommercialItems,
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

  it("commits staged rows once, retaining existing snapshots and deleting only removed rows", async () => {
    const calls: string[] = [];
    const provider = {
      create: async (
        resource: string,
        params: { data: Record<string, unknown> },
      ) => {
        calls.push(`create:${resource}:${params.data.sku}`);
        return { data: { id: "created", ...params.data } };
      },
      update: async (resource: string, params: { id: string }) => {
        calls.push(`update:${resource}:${params.id}`);
        return { data: {} };
      },
      delete: async (resource: string, params: { id: string }) => {
        calls.push(`delete:${resource}:${params.id}`);
        return { data: {} };
      },
    } as never;
    await commitCommercialItems(
      provider,
      "quote",
      "q",
      [
        {
          id: "kept",
          quote_id: "q",
          sku: "A",
          quantity: 1,
          unit_price: 1,
          position: 1,
          product_snapshot: { name: "saved" },
        },
        {
          id: "removed",
          quote_id: "q",
          sku: "B",
          quantity: 1,
          unit_price: 1,
          position: 2,
        },
      ],
      [
        {
          id: "kept",
          quote_id: "q",
          sku: "A",
          quantity: 2,
          unit_price: 1,
          position: 1,
          product_snapshot: { name: "edited" },
        },
        {
          id: "draft-commercial-new",
          sku: "C",
          quantity: 1,
          unit_price: 0,
          position: 2,
          product_snapshot: { name: "new" },
          packing_snapshot: {},
        },
      ],
    );
    expect(calls).toEqual([
      "delete:romiku_quote_items:removed",
      "update:romiku_quote_items:kept",
      "create:romiku_quote_items:C",
    ]);
  });
});
