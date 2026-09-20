import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { SanityCatalogProduct } from "../products/sanityCatalogSource";
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
        parameters: [{ label: { zh: "参数" }, value: "10cm" }],
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
        specification: "参数：10cm",
      },
      packing_snapshot: { description: "12/ctn", qty_per_carton: 24 },
    });
  });

  it("imports specifications only for machine categories when a Quote selects a product", () => {
    const machine: SanityCatalogProduct = {
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

  it("uses the Quote document language for machine names and ordered multilingual parameters", () => {
    const machine: SanityCatalogProduct = {
      id: "lamp-1",
      sku: "LAMP-1",
      skuSort: "LAMP-1",
      isPublished: true,
      category: { title: { zh: "美甲机器" } },
      name: { zh: "美甲灯", en: "Nail Lamp", es: "Lámpara de uñas" },
      parameters: [
        {
          label: { zh: "参数", en: "Specifications", es: "Especificaciones" },
          value: { zh: "30000 RPM", en: "30000 RPM", es: "30000 RPM" },
        },
        { label: { en: "Unrelated" }, value: { en: "omit" } },
      ],
      powerSupply: { zh: "蓄电", en: "Rechargeable", es: "Recargable" },
    };
    expect(
      createItemSnapshot(machine, undefined, {
        documentLanguage: "en",
      }).product_snapshot,
    ).toMatchObject({
      name: "Nail Lamp",
      specification: "Specifications: 30000 RPM\nPower Supply: Rechargeable",
    });
    expect(
      createItemSnapshot(machine, undefined, {
        documentLanguage: "es",
      }).product_snapshot,
    ).toMatchObject({
      name: "Lámpara de uñas",
      specification:
        "Especificaciones: 30000 RPM\nFuente de alimentación: Recargable",
    });
  });

  it("falls back per parameter field without serialising localization objects", () => {
    const snapshot = createItemSnapshot(
      {
        id: "machine-fallback",
        sku: "M-2",
        skuSort: "M-2",
        isPublished: true,
        category: { title: { en: "Nail machine" } },
        name: { en: "Drill" },
        parameters: [
          { label: { en: "Specifications" }, value: { zh: "30000 RPM" } },
        ],
      },
      undefined,
      { documentLanguage: "es" },
    );
    expect(snapshot.product_snapshot).toMatchObject({
      name: "Drill",
      specification: "Specifications: 30000 RPM",
    });
    expect(snapshot.product_snapshot.specification).not.toContain(
      "[object Object]",
    );
  });

  it("uses SUN5's Specifications parameter and website Power Supply fallback by Quote language", () => {
    const sun5: SanityCatalogProduct = {
      id: "product-sun5",
      sku: "SUN5",
      skuSort: "SUN5",
      isPublished: true,
      category: { slug: { current: "nail-lamps-plug-in" } },
      name: { zh: "美甲灯", en: "Nail Lamp", es: "LáMpara De UñAs" },
      parameters: [
        {
          label: { zh: "参数", en: "Specifications", es: "Especificaciones" },
          value: { zh: "48W 24LEDS", en: "48W 24LEDS", es: "48W 24LEDS" },
        },
        { label: { zh: "无关参数", en: "Unrelated" }, value: { en: "omit" } },
      ],
      powerSupply: null,
    };
    const localizedPowerSupply = { zh: "插电", en: "Plug-in", es: "Con cable" };
    expect(
      createItemSnapshot(sun5, undefined, {
        includeSpecification: true,
        documentLanguage: "zh",
        localizedPowerSupply,
      }).product_snapshot.specification,
    ).toBe("参数：48W 24LEDS\n供电方式：插电");
    expect(
      createItemSnapshot(sun5, undefined, {
        includeSpecification: true,
        documentLanguage: "en",
        localizedPowerSupply,
      }).product_snapshot.specification,
    ).toBe("Specifications: 48W 24LEDS\nPower Supply: Plug-in");
    expect(
      createItemSnapshot(sun5, undefined, {
        includeSpecification: true,
        documentLanguage: "es",
        localizedPowerSupply,
      }).product_snapshot.specification,
    ).toBe("Especificaciones: 48W 24LEDS\nFuente de alimentación: Con cable");
  });

  it("prefers Sanity powerSupply over the website fallback", () => {
    const snapshot = createItemSnapshot(
      {
        id: "machine-primary",
        sku: "M-3",
        skuSort: "M-3",
        isPublished: true,
        category: { title: { en: "Nail Machines" } },
        parameters: [{ label: { en: "Specifications" }, value: { en: "48W" } }],
        powerSupply: { en: "Battery" },
      },
      undefined,
      {
        includeSpecification: true,
        documentLanguage: "en",
        localizedPowerSupply: { en: "Plug-in" },
      },
    );
    expect(snapshot.product_snapshot.specification).toBe(
      "Specifications: 48W\nPower Supply: Battery",
    );
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
