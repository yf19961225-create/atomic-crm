import { describe, expect, it } from "vitest";

import {
  createSanityProductSource,
  type SanityProductLookupConfiguration,
} from "./sanityProductSource";

const configuredSource: SanityProductLookupConfiguration = {
  lookupBySku: async (sku) =>
    sku === "RMK-100"
      ? { _id: "sanity-product-100", sku: "RMK-100", title: "Travel mug" }
      : null,
  mapRecord: (record) => {
    const value = record as { _id: string; sku: string; title: string };
    return {
      sanityProductId: value._id,
      sku: value.sku,
      title: value.title,
    };
  },
};

describe("createSanityProductSource", () => {
  it("maps an explicitly configured read result for the requested SKU", async () => {
    const source = createSanityProductSource(configuredSource);

    await expect(source.findBySku("RMK-100")).resolves.toEqual({
      status: "matched",
      product: {
        sanityProductId: "sanity-product-100",
        sku: "RMK-100",
        title: "Travel mug",
      },
    });
  });

  it("returns unmatched when no record can be mapped, leaving master creation to Sanity", async () => {
    const source = createSanityProductSource(configuredSource);

    await expect(source.findBySku("UNKNOWN-SKU")).resolves.toEqual({
      status: "unmatched",
      sku: "UNKNOWN-SKU",
    });
  });

  it("fails closed to unmatched when no read configuration is supplied", async () => {
    const source = createSanityProductSource();

    await expect(source.findBySku("RMK-100")).resolves.toEqual({
      status: "unmatched",
      sku: "RMK-100",
    });
  });

  it("exposes loading before a configured lookup resolves", () => {
    expect(createSanityProductSource().initialState).toEqual({
      status: "loading",
    });
  });

  it("returns an error state when the configured read fails", async () => {
    const source = createSanityProductSource({
      lookupBySku: async () => {
        throw new Error("Sanity unavailable");
      },
      mapRecord: () => null,
    });

    await expect(source.findBySku("RMK-100")).resolves.toEqual({
      status: "error",
      sku: "RMK-100",
      message: "Sanity 产品查询失败。",
    });
  });
});
