import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import "@/index.css";
import type { SanityCatalogProduct } from "../products/sanityCatalogSource";
import {
  commercialSearchPanelPosition,
  createItemSnapshot,
  ProductLibraryLookup,
  shouldImportProductSpecifications,
} from "./ProductLibraryLookup";

describe("Product Library item snapshots", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  it("keeps one SKU input in the cell and portals only a compact aligned results list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              input.startsWith("/api/product-catalog")
                ? {
                    result: [
                      {
                        _id: "compact",
                        sku: "SKU-1",
                        isPublished: true,
                        name: { zh: "测试产品" },
                      },
                    ],
                  }
                : { images: {}, powerSupplies: {} },
            ),
          ),
        ),
      ),
    );
    const screen = await render(
      <div style={{ width: 540, overflow: "hidden" }}>
        <ProductLibraryLookup
          wideCommercial
          onSelected={vi.fn()}
          onManualSku={vi.fn()}
        />
      </div>,
    );
    const cellInput = screen.getByLabelText("搜索 SKU 或产品");
    await cellInput.fill("SKU-1");
    await screen.getByRole("button", { name: "搜索", exact: true }).click();
    await expect
      .element(screen.getByRole("button", { name: /SKU-1 · 测试产品/ }))
      .toBeVisible();

    const panel = document.querySelector<HTMLElement>(
      '[role="listbox"][aria-label="产品搜索结果"]',
    );
    expect(panel).not.toBeNull();
    expect(panel?.parentElement).toBe(document.body);
    expect(
      document.querySelectorAll('input[aria-label="搜索 SKU 或产品"]'),
    ).toHaveLength(1);
    expect(panel?.querySelector("input")).toBeNull();
    await expect
      .poll(() =>
        Math.abs(
          panel!.getBoundingClientRect().width -
            cellInput.element().getBoundingClientRect().width,
        ),
      )
      .toBeLessThan(1);
    expect(panel!.getBoundingClientRect().height).toBeLessThanOrEqual(320);
    expect(panel!.getBoundingClientRect().right).toBeLessThanOrEqual(
      window.innerWidth - 12,
    );
  });

  it("realigns the portal when its table cell resizes without a window resize", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (input: string) =>
          new Response(
            JSON.stringify(
              input.startsWith("/api/product-catalog")
                ? {
                    result: [
                      { _id: "resize", sku: "RESIZE", isPublished: true },
                    ],
                  }
                : { images: {}, powerSupplies: {} },
            ),
          ),
      ),
    );
    const screen = await render(
      <div data-testid="resize-cell" style={{ width: 400 }}>
        <ProductLibraryLookup
          wideCommercial
          onSelected={vi.fn()}
          onManualSku={vi.fn()}
        />
      </div>,
    );
    await screen.getByLabelText("搜索 SKU 或产品").fill("RESIZE");
    await screen.getByRole("button", { name: "搜索", exact: true }).click();
    await expect
      .element(screen.getByRole("button", { name: /RESIZE ·/ }))
      .toBeVisible();
    const input = screen.getByLabelText("搜索 SKU 或产品").element();
    const panel = document.querySelector<HTMLElement>(
      '[aria-label="产品搜索结果"]',
    )!;
    (input as HTMLInputElement).style.width = "360px";
    await expect
      .poll(() =>
        Math.abs(
          panel.getBoundingClientRect().width -
            input.getBoundingClientRect().width,
        ),
      )
      .toBeLessThan(1);
  });

  it("scrolls compact 40px rows with 30px same-SKU thumbnails inside 320px", async () => {
    const thumbnail = new URL("/appIcon/152.png", location.href).href;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              input.startsWith("/api/product-catalog")
                ? {
                    result: Array.from({ length: 12 }, (_, index) => ({
                      _id: `compact-${index}`,
                      sku: `SKU-${index}`,
                      isPublished: true,
                      name: { zh: `产品 ${index}` },
                    })),
                  }
                : {
                    images: Object.fromEntries(
                      Array.from({ length: 12 }, (_, index) => [
                        `SKU-${index}`,
                        thumbnail,
                      ]),
                    ),
                    powerSupplies: {},
                  },
            ),
          ),
        ),
      ),
    );
    const screen = await render(
      <ProductLibraryLookup
        wideCommercial
        onSelected={vi.fn()}
        onManualSku={vi.fn()}
      />,
    );
    await screen.getByLabelText("搜索 SKU 或产品").fill("SKU");
    await screen.getByRole("button", { name: "搜索", exact: true }).click();
    await expect
      .element(screen.getByRole("button", { name: /SKU-0 · 产品 0/ }))
      .toBeVisible();
    const panel = document.querySelector<HTMLElement>(
      '[role="listbox"][aria-label="产品搜索结果"]',
    )!;
    const list = panel.querySelector("ul")!;
    const first = list.querySelector("button")!;
    const image = first.querySelector("img")!;
    expect(first.getBoundingClientRect().height).toBeCloseTo(40, 0);
    expect(image.getBoundingClientRect().width).toBeCloseTo(30, 0);
    expect(image.getBoundingClientRect().height).toBeCloseTo(30, 0);
    expect(list.clientHeight).toBeLessThanOrEqual(320);
    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
  });

  it("selects a result in the commercial portal without committing a manual SKU on blur", async () => {
    const onSelected = vi.fn();
    const onManualSku = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              input.startsWith("/api/product-catalog")
                ? {
                    result: [
                      {
                        _id: "portal-product",
                        sku: "PORTAL-1",
                        isPublished: true,
                        name: { zh: "测试产品" },
                      },
                    ],
                  }
                : { images: {}, powerSupplies: {} },
            ),
          ),
        ),
      ),
    );
    const screen = await render(
      <ProductLibraryLookup
        wideCommercial
        onSelected={onSelected}
        onManualSku={onManualSku}
      />,
    );
    await screen.getByLabelText("搜索 SKU 或产品").fill("PORTAL");
    await screen.getByRole("button", { name: "搜索", exact: true }).click();
    await expect
      .element(screen.getByRole("button", { name: /PORTAL-1 · 测试产品/ }))
      .toBeVisible();
    await screen.getByRole("button", { name: /PORTAL-1 · 测试产品/ }).click();
    expect(onSelected.mock.calls[0]?.[0]?.sku).toBe("PORTAL-1");
    expect(onManualSku).not.toHaveBeenCalled();
  });

  it("keeps manual SKU entry and clearing in the original commercial input", async () => {
    const onManualSku = vi.fn();
    const screen = await render(
      <div>
        <ProductLibraryLookup
          wideCommercial
          onSelected={vi.fn()}
          onManualSku={onManualSku}
        />
        <button type="button">离开搜索</button>
      </div>,
    );
    const input = screen.getByLabelText("搜索 SKU 或产品");
    await input.fill("TEMP-SKU");
    await screen.getByRole("button", { name: "清空", exact: true }).click();
    expect((input.element() as HTMLInputElement).value).toBe("");
    expect(onManualSku).not.toHaveBeenCalled();

    await input.fill("MANUAL-1");
    await screen.getByRole("button", { name: "离开搜索" }).click();
    expect(onManualSku).toHaveBeenCalledExactlyOnceWith("MANUAL-1");
    expect(
      document.querySelector('[role="listbox"][aria-label="产品搜索结果"]'),
    ).toBeNull();
  });

  it("keeps Enter search and arrow-key result selection in the commercial panel", async () => {
    const onSelected = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              input.startsWith("/api/product-catalog")
                ? {
                    result: [
                      {
                        _id: "keyboard-product",
                        sku: "KEY-1",
                        isPublished: true,
                        name: { zh: "键盘测试产品" },
                      },
                    ],
                  }
                : { images: {}, powerSupplies: {} },
            ),
          ),
        ),
      ),
    );
    const screen = await render(
      <ProductLibraryLookup
        wideCommercial
        onSelected={onSelected}
        onManualSku={vi.fn()}
      />,
    );
    await screen.getByLabelText("搜索 SKU 或产品").fill("KEY");
    await userEvent.keyboard("{Enter}");
    await expect
      .element(screen.getByRole("button", { name: /KEY-1 · 键盘测试产品/ }))
      .toBeVisible();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onSelected.mock.calls[0]?.[0]?.sku).toBe("KEY-1");
  });
  it("anchors the results to input width and flips above near viewport bottom", () => {
    expect(
      commercialSearchPanelPosition(1654, 900, {
        left: 332,
        top: 300,
        bottom: 340,
        width: 220,
      }),
    ).toMatchObject({ left: 332, width: 220, top: 344 });
    expect(
      commercialSearchPanelPosition(1024, 900, {
        left: 900,
        top: 300,
        bottom: 340,
        width: 220,
      }),
    ).toMatchObject({ left: 792, width: 220 });
    expect(
      commercialSearchPanelPosition(390, 844, {
        left: 300,
        top: 700,
        bottom: 736,
        width: 220,
      }),
    ).toMatchObject({
      left: 158,
      width: 220,
      maxHeight: 320,
      top: 696,
      transform: "translateY(-100%)",
    });
  });
  it("uses the exact website thumbnail first and falls back to its own Sanity image", async () => {
    const primary = new URL("/appIcon/152.png", location.href).href;
    const fallback = new URL("/appIcon/144.png", location.href).href;
    const onSelected = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              input.startsWith("/api/product-catalog")
                ? {
                    result: [
                      {
                        _id: "product-img",
                        sku: "IMG-1",
                        name: { zh: "测试产品" },
                        images: [{ url: primary }],
                        isPublished: true,
                      },
                    ],
                  }
                : { images: { "IMG-1": fallback }, powerSupplies: {} },
            ),
          ),
        ),
      ),
    );
    const screen = await render(
      <ProductLibraryLookup onSelected={onSelected} onManualSku={vi.fn()} />,
    );
    await screen.getByLabelText("搜索 SKU 或产品").fill("IMG-1");
    await screen.getByRole("button", { name: "搜索", exact: true }).click();
    await expect
      .element(screen.getByRole("button", { name: /IMG-1 · 测试产品/ }))
      .toBeVisible();
    const image = screen.container.querySelector("ul img") as HTMLImageElement;
    expect(image.src).toBe(fallback);
    image.dispatchEvent(new Event("error"));
    await expect
      .poll(
        () =>
          (screen.container.querySelector("ul img") as HTMLImageElement)?.src,
      )
      .toBe(primary);
    await expect
      .poll(
        () =>
          (screen.container.querySelector("ul img") as HTMLImageElement)
            ?.naturalWidth,
      )
      .toBeGreaterThan(0);
    await expect
      .poll(
        () =>
          (screen.container.querySelector("ul img") as HTMLImageElement)
            ?.className,
      )
      .toContain("opacity-100");
    await screen.getByRole("button", { name: /IMG-1 · 测试产品/ }).click();
    expect(onSelected.mock.calls[0]?.[0]?.product_snapshot?.image_url).toBe(
      primary,
    );
  });
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
        specification: "10cm",
      },
      packing_snapshot: { description: "12/ctn", qty_per_carton: 24 },
    });
  });

  it("uses preferred or sole supplier packing for a Quote snapshot, otherwise falls back only to Sanity Qty/Ctn", () => {
    const product: SanityCatalogProduct = {
      id: "packing-product",
      sku: "PACK-1",
      skuSort: "PACK-1",
      isPublished: true,
      cartonQty: 12,
    };
    expect(
      createItemSnapshot(product, undefined, {
        procurementPacking: {
          supplierCount: 2,
          qtyPerCarton: 24,
          lengthCm: 50,
          widthCm: 40,
          heightCm: 30,
        },
      }).packing_snapshot,
    ).toMatchObject({
      qty_per_carton: 24,
      length_cm: 50,
      width_cm: 40,
      height_cm: 30,
      carton_cbm: 0.06,
    });
    expect(
      createItemSnapshot(product, undefined, {
        procurementPacking: { supplierCount: 2 },
      }).packing_snapshot,
    ).toMatchObject({ qty_per_carton: 12 });
  });

  it("captures product-level packing defaults without a supplier only into a newly selected snapshot", () => {
    const product: SanityCatalogProduct = {
      id: "default-product",
      sku: "DEF-1",
      skuSort: "DEF-1",
      isPublished: true,
      cartonQty: 12,
    };
    const snapshot = createItemSnapshot(product, undefined, {
      includeCartonWeight: true,
      procurementPacking: {
        supplierCount: 0,
        qtyPerCarton: 24,
        lengthCm: 50,
        widthCm: 40,
        heightCm: 35,
        cartonWeightKg: 12.5,
      },
    });
    expect(snapshot.packing_snapshot).toMatchObject({
      qty_per_carton: 24,
      length_cm: 50,
      width_cm: 40,
      height_cm: 35,
      carton_weight_kg: 12.5,
      carton_cbm: 0.07,
    });
  });

  it("captures selected supplier weight and the saved unit for an independent Packing snapshot", () => {
    const snapshot = createItemSnapshot(
      {
        id: "packing-direct",
        sku: "PACK-DIRECT",
        skuSort: "PACK-DIRECT",
        isPublished: true,
        cartonQty: 12,
        moqUnit: { zh: "PCS", en: "PCS" },
      },
      "https://example.com/packing-direct.jpg",
      {
        includeUnit: true,
        includeCartonWeight: true,
        procurementPacking: {
          supplierCount: 1,
          qtyPerCarton: 24,
          lengthCm: 50,
          widthCm: 40,
          heightCm: 30,
          cartonWeightKg: 8.5,
        },
      },
    );

    expect(snapshot).toMatchObject({
      product_snapshot: {
        name: "PACK-DIRECT",
        image_url: "https://example.com/packing-direct.jpg",
        unit: "PCS",
      },
      packing_snapshot: {
        qty_per_carton: 24,
        length_cm: 50,
        width_cm: 40,
        height_cm: 30,
        carton_weight_kg: 8.5,
      },
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
      specification: "30000 RPM Rechargeable",
    });
    expect(
      createItemSnapshot(machine, undefined, {
        documentLanguage: "es",
      }).product_snapshot,
    ).toMatchObject({
      name: "Lámpara de uñas",
      specification: "30000 RPM Recargable",
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
      specification: "30000 RPM",
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
    ).toBe("48W 24LEDS 插电");
    expect(
      createItemSnapshot(sun5, undefined, {
        includeSpecification: true,
        documentLanguage: "en",
        localizedPowerSupply,
      }).product_snapshot.specification,
    ).toBe("48W 24LEDS Plug-in");
    expect(
      createItemSnapshot(sun5, undefined, {
        includeSpecification: true,
        documentLanguage: "es",
        localizedPowerSupply,
      }).product_snapshot.specification,
    ).toBe("48W 24LEDS Con cable");
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
    expect(snapshot.product_snapshot.specification).toBe("48W Battery");
  });

  it("keeps the sole available machine value without a label or separator", () => {
    const snapshot = createItemSnapshot(
      {
        id: "machine-power-only",
        sku: "M-POWER",
        skuSort: "M-POWER",
        isPublished: true,
        category: { title: { en: "Nail Machines" } },
        powerSupply: { en: "Plug-in" },
      },
      undefined,
      { includeSpecification: true, documentLanguage: "en" },
    );
    expect(snapshot.product_snapshot.specification).toBe("Plug-in");
  });

  it("recognizes SUN5 as a machine through its Sanity category hierarchy", () => {
    expect(
      shouldImportProductSpecifications("quote", {
        id: "product-sun5",
        sku: "SUN5",
        skuSort: "SUN5",
        isPublished: true,
        category: {
          slug: { current: "nail-lamps-plug-in" },
          parent: {
            slug: { current: "nail-lamps" },
            parent: {
              slug: { current: "nail-machines" },
              title: { en: "Nail Machines", zh: "美甲机器" },
            },
          },
        },
      }),
    ).toBe(true);
  });

  it("passes SUN5's final machine specification snapshot through the Quote selector", async () => {
    const onSelected = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input.startsWith("/api/product-catalog"))
          return Promise.resolve(
            new Response(
              JSON.stringify({
                result: [
                  {
                    _id: "product-sun5",
                    sku: "SUN5",
                    isPublished: true,
                    name: { en: "Nail Lamp" },
                    category: {
                      slug: { current: "nail-lamps-plug-in" },
                      parent: {
                        slug: { current: "nail-lamps" },
                        parent: { slug: { current: "nail-machines" } },
                      },
                    },
                    parameters: [
                      {
                        label: { en: "Specifications" },
                        value: { en: "48W 24LEDS" },
                      },
                    ],
                    powerSupply: null,
                  },
                ],
              }),
            ),
          );
        return Promise.resolve(
          new Response(
            JSON.stringify({
              images: {},
              powerSupplies: { SUN5: { en: "Plug-in" } },
            }),
          ),
        );
      }),
    );
    const screen = await render(
      <ProductLibraryLookup
        specificationMode="machines-only"
        documentLanguage="en"
        onSelected={onSelected}
        onManualSku={vi.fn()}
      />,
    );
    await screen.getByLabelText("搜索 SKU 或产品", { exact: true }).fill("SUN");
    await screen.getByRole("button", { name: "搜索", exact: true }).click();
    await expect
      .element(screen.getByText("SUN5", { exact: true }))
      .toBeVisible();
    await screen.getByText("SUN5", { exact: true }).click();
    expect(onSelected.mock.calls[0]?.[0]?.product_snapshot?.specification).toBe(
      "48W 24LEDS Plug-in",
    );
  });

  it.each([
    [
      "101",
      "35000RPM",
      { zh: "蓄电", en: "Rechargeable", es: "Recargable" },
      "35000RPM 蓄电",
      "35000RPM Rechargeable",
      "35000RPM Recargable",
    ],
    [
      "2000PLUS",
      "45000RPM",
      { zh: "插电", en: "Plug-in", es: "Con cable" },
      "45000RPM 插电",
      "45000RPM Plug-in",
      "45000RPM Con cable",
    ],
  ])(
    "formats real machine SKU %s in zh, en and es from its CMS snapshot",
    (sku, value, powerSupply, zh, en, es) => {
      const product: SanityCatalogProduct = {
        id: `product-${sku}`,
        sku,
        skuSort: sku,
        isPublished: true,
        category: { parent: { title: { en: "Nail Machines" } } },
        parameters: [
          {
            label: {
              zh: "参数",
              en: "Specifications",
              es: "Especificaciones",
            },
            value: { zh: value, en: value, es: value },
          },
        ],
        powerSupply,
      };
      expect(
        createItemSnapshot(product, undefined, {
          includeSpecification: true,
          documentLanguage: "zh",
        }).product_snapshot.specification,
      ).toBe(zh);
      expect(
        createItemSnapshot(product, undefined, {
          includeSpecification: true,
          documentLanguage: "en",
        }).product_snapshot.specification,
      ).toBe(en);
      expect(
        createItemSnapshot(product, undefined, {
          includeSpecification: true,
          documentLanguage: "es",
        }).product_snapshot.specification,
      ).toBe(es);
    },
  );

  it("keeps keyboard navigation at the ends of the full result set", async () => {
    const onSelected = vi.fn();
    const scrollIntoView = vi
      .spyOn(HTMLElement.prototype, "scrollIntoView")
      .mockImplementation(() => undefined);
    const results = Array.from({ length: 12 }, (_, index) => ({
      _id: `sun-${index + 1}`,
      sku: `SUN-${index + 1}`,
      isPublished: true,
      name: { en: `Sun ${index + 1}` },
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              input.startsWith("/api/product-catalog")
                ? { result: results }
                : { images: {}, powerSupplies: {} },
            ),
          ),
        ),
      ),
    );
    const screen = await render(
      <ProductLibraryLookup onSelected={onSelected} onManualSku={vi.fn()} />,
    );
    const input = screen.getByLabelText("搜索 SKU 或产品", { exact: true });
    await input.fill("SUN");
    await screen.getByRole("button", { name: "搜索", exact: true }).click();
    await expect
      .element(screen.getByText("SUN-12", { exact: true }))
      .toBeVisible();
    await input.click();
    await userEvent.keyboard("{ArrowUp}");
    for (let index = 0; index < 20; index += 1)
      await userEvent.keyboard("{ArrowDown}");
    expect(scrollIntoView).toHaveBeenCalled();
    await userEvent.keyboard("{Enter}");
    expect(onSelected.mock.calls[0]?.[0]?.sku).toBe("SUN-12");
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
  });

  it("does not clear the product snapshot as a manual SKU when selecting a result", async () => {
    const onSelected = vi.fn();
    const onManualSku = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              input.startsWith("/api/product-catalog")
                ? {
                    result: [
                      {
                        _id: "machine-2000plus",
                        sku: "2000PLUS",
                        isPublished: true,
                        name: { zh: "美甲打磨机" },
                      },
                    ],
                  }
                : { images: {}, powerSupplies: {} },
            ),
          ),
        ),
      ),
    );
    const screen = await render(
      <ProductLibraryLookup
        onSelected={onSelected}
        onManualSku={onManualSku}
      />,
    );
    await screen
      .getByLabelText("搜索 SKU 或产品", { exact: true })
      .fill("2000");
    await screen.getByRole("button", { name: "搜索", exact: true }).click();
    await expect
      .element(screen.getByText("2000PLUS", { exact: true }))
      .toBeVisible();
    await screen.getByText("2000PLUS", { exact: true }).click();

    expect(onSelected).toHaveBeenCalledWith(
      expect.objectContaining({
        sku: "2000PLUS",
        product_snapshot: expect.objectContaining({ name: "美甲打磨机" }),
      }),
    );
    expect(onManualSku).not.toHaveBeenCalled();
  });
});

describe("live product lookup", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  const record = (sku: string) => ({
    _id: sku,
    sku,
    isPublished: true,
    name: { zh: `产品 ${sku}` },
  });
  const reply = (result: unknown[]) => new Response(JSON.stringify({ result }));

  it("searches after typing without a second action and does not wait for website metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.startsWith("/api/product-catalog")
          ? Promise.resolve(reply([record("NA255")]))
          : new Promise(() => {}),
      ),
    );
    const screen = await render(
      <ProductLibraryLookup
        onSelected={vi.fn()}
        onManualSku={vi.fn()}
        wideCommercial
      />,
    );
    await screen.getByLabelText("搜索 SKU 或产品").fill("NA25");
    await expect
      .element(screen.getByRole("button", { name: /NA255 · 产品 NA255/ }))
      .toBeVisible();
  });

  it("reports no matching products", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(reply([]))),
    );
    const screen = await render(
      <ProductLibraryLookup
        onSelected={vi.fn()}
        onManualSku={vi.fn()}
        wideCommercial
      />,
    );
    await screen.getByLabelText("搜索 SKU 或产品").fill("NOT-FOUND");
    await expect.element(screen.getByText("未找到匹配产品")).toBeVisible();
  });

  it("Escape cancels delayed results instead of reopening the list", async () => {
    let finish: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.startsWith("/api/product-catalog")
          ? new Promise<Response>((resolve) => {
              finish = resolve;
            })
          : Promise.resolve(new Response("{}")),
      ),
    );
    const screen = await render(
      <ProductLibraryLookup
        onSelected={vi.fn()}
        onManualSku={vi.fn()}
        wideCommercial
      />,
    );
    const input = screen.getByLabelText("搜索 SKU 或产品");
    await input.fill("NA25");
    await expect.poll(() => typeof finish).toBe("function");
    await userEvent.keyboard("{Escape}");
    finish!(reply([record("NA255")]));
    await input.click();
    await expect
      .element(screen.getByRole("button", { name: /NA255 · 产品 NA255/ }))
      .not.toBeInTheDocument();
  });

  it("does not allow old suggestions after editing the query", async () => {
    let finishOld: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (!url.startsWith("/api/product-catalog"))
          return Promise.resolve(new Response("{}"));
        if (new URL(url, location.href).searchParams.get("search") === "OLD")
          return new Promise<Response>((resolve) => {
            finishOld = resolve;
          });
        return Promise.resolve(reply([record("NEW")]));
      }),
    );
    const selected = vi.fn();
    const screen = await render(
      <ProductLibraryLookup
        onSelected={selected}
        onManualSku={vi.fn()}
        wideCommercial
      />,
    );
    const input = screen.getByLabelText("搜索 SKU 或产品");
    await input.fill("OLD");
    await expect.poll(() => typeof finishOld).toBe("function");
    await input.fill("NEW");
    await expect
      .element(screen.getByRole("button", { name: /NEW · 产品 NEW/ }))
      .toBeVisible();
    finishOld!(reply([record("OLD")]));
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => selected.mock.calls[0]?.[0]?.sku).toBe("NEW");
    expect(selected).toHaveBeenCalledTimes(1);
  });
});

it("suppresses IME queries until composition completes", async () => {
  const fetcher = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify({ result: [] }))),
  );
  vi.stubGlobal("fetch", fetcher);
  const screen = await render(
    <ProductLibraryLookup
      onSelected={vi.fn()}
      onManualSku={vi.fn()}
      wideCommercial
    />,
  );
  const input = screen.getByLabelText("搜索 SKU 或产品");
  input
    .element()
    .dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  await input.fill("美甲");
  await new Promise((resolve) => setTimeout(resolve, 350));
  expect(fetcher).not.toHaveBeenCalled();
  input
    .element()
    .dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
  await expect.element(screen.getByText("未找到匹配产品")).toBeVisible();
  vi.unstubAllGlobals();
});

it("cancels a product selection awaiting metadata when the user changes SKU", async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.startsWith("/api/product-catalog"))
        return Promise.resolve(
          new Response(
            JSON.stringify({
              result: [
                {
                  _id: "old",
                  sku: "OLD",
                  isPublished: true,
                  name: { zh: "旧产品" },
                },
              ],
            }),
          ),
        );
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    }),
  );
  const selected = vi.fn();
  const manual = vi.fn();
  const screen = await render(
    <ProductLibraryLookup
      onSelected={selected}
      onManualSku={manual}
      wideCommercial
    />,
  );
  const input = screen.getByLabelText("搜索 SKU 或产品");
  await input.fill("OLD");
  await expect
    .element(screen.getByRole("button", { name: /OLD · 旧产品/ }))
    .toBeVisible();
  await screen.getByRole("button", { name: /OLD · 旧产品/ }).click();
  expect(manual).not.toHaveBeenCalled();
  await input.fill("NEW");
  finish(new Response("{}"));
  await userEvent.keyboard("{Escape}");
  expect(selected).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it("finishes selecting visible catalog results when optional website metadata stalls", async () => {
  const selected = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      url.startsWith("/api/product-catalog")
        ? Promise.resolve(
            new Response(
              JSON.stringify({
                result: [{ _id: "bounded", sku: "BOUNDED", isPublished: true }],
              }),
            ),
          )
        : new Promise<Response>(() => {}),
    ),
  );
  const screen = await render(
    <ProductLibraryLookup onSelected={selected} onManualSku={vi.fn()} />,
  );
  await screen.getByLabelText("搜索 SKU 或产品").fill("BOUNDED");
  await expect
    .element(screen.getByRole("button", { name: /BOUNDED ·/ }))
    .toBeVisible();
  await screen.getByRole("button", { name: /BOUNDED ·/ }).click();
  await expect
    .poll(() => selected.mock.calls.length, { timeout: 4500 })
    .toBe(1);
  expect(selected.mock.calls[0][0].sku).toBe("BOUNDED");
  vi.unstubAllGlobals();
});
