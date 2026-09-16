import { describe, expect, it } from "vitest";
import {
  mapRomikuSanityRecord,
  romikuSanityConfig,
} from "./romikuSanityProductSource";

describe("ROMIKU Sanity mapping", () => {
  it("maps the configured product shape without copying a product master", () => {
    const mapped = mapRomikuSanityRecord({
      _id: "product-005",
      sku: "005",
      name: { en: "Storage box", zh: "收纳箱" },
      images: [{ url: "https://example.test/005.jpg" }],
      parameters: [{ label: { en: "Material" }, value: { en: "PP" } }],
      category: { _ref: "category-storage", title: { en: "Storage Box" } },
      moqQuantity: 64,
      moqUnit: { en: "PCS" },
      packaging: { en: "OPP Bag" },
      cartonQty: 32,
      powerSupply: {},
      isPublished: true,
      sortOrder: 1,
      colors: [],
    });

    expect(mapped).toMatchObject({
      sanityProductId: "product-005",
      sku: "005",
      title: "Storage box",
      imageUrl: "https://example.test/005.jpg",
      parameters: [{ label: { en: "Material" }, value: { en: "PP" } }],
      category: { _ref: "category-storage" },
    });
    expect(romikuSanityConfig).toEqual({
      projectId: "gxuvcyaa",
      dataset: "production",
      apiVersion: "2025-07-05",
    });
  });
});
