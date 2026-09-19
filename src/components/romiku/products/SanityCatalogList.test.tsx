import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { SanityCatalogList } from "./SanityCatalogList";
import type { SanityCatalogProduct } from "./sanityCatalogSource";

const getPage = vi.hoisted(() => vi.fn());
const loadOverlay = vi.hoisted(() => vi.fn());

vi.mock("./sanityCatalogSource", () => ({
  createSanityCatalogSource: () => ({ getPage }),
}));

vi.mock("./productProcurementOverlay", () => ({
  loadProductProcurementOverlay: loadOverlay,
  unavailableOverlay: (products: SanityCatalogProduct[]) =>
    new Map(
      products.map((catalogProduct) => [
        catalogProduct.id,
        { supplierCount: 0, unavailable: true },
      ]),
    ),
}));

const product = (
  overrides: Partial<SanityCatalogProduct> = {},
): SanityCatalogProduct => ({
  id: "sanity-1",
  skuSort: "RMK-100",
  isPublished: true,
  sku: "RMK-100",
  name: { zh: "收纳盒", en: "Storage box" },
  category: { title: { zh: "收纳" } },
  moqQuantity: 120,
  moqUnit: { zh: "个" },
  packaging: { zh: "彩盒" },
  cartonQty: 24,
  ...overrides,
});

describe("SanityCatalogList", () => {
  beforeEach(() => {
    getPage.mockReset();
    loadOverlay.mockReset().mockResolvedValue(new Map());
  });

  it("renders the published Sanity product fields returned for the catalog page", async () => {
    getPage.mockResolvedValue({ products: [product()] });

    const screen = await render(<SanityCatalogList />);

    await expect
      .element(screen.getByRole("cell", { name: "RMK-100" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "收纳盒" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "Storage box" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "120 个" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "彩盒" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "24" }))
      .toBeVisible();
  });

  it("keeps the catalog readable when optional Sanity fields are missing", async () => {
    getPage.mockResolvedValue({
      products: [
        product({
          sku: undefined,
          name: { en: "English name" },
          category: undefined,
          moqQuantity: undefined,
          moqUnit: undefined,
          packaging: undefined,
          cartonQty: undefined,
        }),
      ],
    });

    const screen = await render(<SanityCatalogList />);

    await expect
      .element(screen.getByRole("cell", { name: "English name" }).first())
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "—" }).first())
      .toBeVisible();
  });

  it("shows a Chinese error message when the read-only catalog request fails", async () => {
    getPage.mockRejectedValue(new Error("Sanity unavailable"));

    const screen = await render(<SanityCatalogList />);

    await expect
      .element(screen.getByText("产品目录暂时无法加载。"))
      .toBeVisible();
  });

  it("renders batched procurement data alongside the Sanity catalog product", async () => {
    getPage.mockResolvedValue({ products: [product()] });
    loadOverlay.mockResolvedValue(
      new Map([
        [
          "sanity-1",
          {
            supplierCount: 2,
            preferredSupplier: "华东供应商",
            supplierMoq: 80,
            leadDays: 12,
            referenceCost: { cost: 3.5, currency: "USD" },
            internalNotes: "确认包装颜色",
          },
        ],
      ]),
    );

    const screen = await render(<SanityCatalogList />);

    await expect.element(screen.getByText("供应商数")).toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "华东供应商" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "80" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "12 天" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "USD 3.50" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "有备注" }))
      .toBeVisible();
  });

  it("keeps Sanity products visible when no procurement records are associated", async () => {
    getPage.mockResolvedValue({ products: [product()] });
    loadOverlay.mockResolvedValue(
      new Map([["sanity-1", { supplierCount: 0 }]]),
    );

    const screen = await render(<SanityCatalogList />);

    await expect
      .element(screen.getByRole("cell", { name: "收纳盒" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "—" }).last())
      .toBeVisible();
  });

  it("isolates an overlay failure to procurement columns", async () => {
    getPage.mockResolvedValue({ products: [product()] });
    loadOverlay.mockRejectedValue(new Error("Supabase unavailable"));

    const screen = await render(<SanityCatalogList />);

    await expect
      .element(screen.getByRole("cell", { name: "收纳盒" }))
      .toBeVisible();
    await expect
      .element(screen.getByText("暂时无法加载").first())
      .toBeVisible();
  });
});
