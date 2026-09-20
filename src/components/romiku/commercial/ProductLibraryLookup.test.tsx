import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import {
  createItemSnapshot,
  ProductLibraryLookup,
  shouldImportProductSpecifications,
} from "./ProductLibraryLookup";

describe("Product Library item snapshots", () => {
  it("captures the selected catalog product and website image without master linkage writes", () => {
    const snapshot = createItemSnapshot(
      {
        id: "sanity-005",
        sku: "005",
        skuSort: "005",
        isPublished: true,
        name: { zh: "中文名", en: "English" },
        moqQuantity: 120,
        packaging: { zh: "12/ctn" },
        cartonQty: 24,
        parameters: [{ label: { zh: "规格" }, value: "10cm" }],
      },
      "https://romiku.com/images/products-local/005_main1.jpg",
    );
    expect(snapshot).toMatchObject({
      sanity_product_id: "sanity-005",
      sku: "005",
      product_snapshot: {
        name: "中文名",
        image_url: "https://romiku.com/images/products-local/005_main1.jpg",
        moq: 120,
        specification: "规格: 10cm",
      },
      packing_snapshot: { description: "12/ctn", qty_per_carton: 24 },
    });
  });

  it("imports specifications only for machine categories when a Quote selects a product", () => {
    const machine = {
      id: "machine",
      sku: "M-1",
      skuSort: "M-1",
      isPublished: true,
      category: { title: { en: "Nail Machines" } },
      parameters: [{ label: { en: "Voltage" }, value: "220V" }],
    };
    const accessory = {
      ...machine,
      id: "accessory",
      category: { title: { zh: "收纳" } },
    };
    expect(shouldImportProductSpecifications("quote", machine)).toBe(true);
    expect(shouldImportProductSpecifications("quote", accessory)).toBe(false);
    expect(shouldImportProductSpecifications("pi", machine)).toBe(false);
    expect(
      createItemSnapshot(accessory, undefined, { includeSpecification: false })
        .product_snapshot,
    ).not.toHaveProperty("specification");
  });

  it("does not query the catalog merely to display an existing SKU", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const screen = await render(
      <ProductLibraryLookup
        sku="005"
        onSelected={vi.fn()}
        onManualSku={vi.fn()}
      />,
    );
    await screen.getByLabelText("搜索 SKU 或产品", { exact: true }).click();
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
