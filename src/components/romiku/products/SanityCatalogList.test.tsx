import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { SanityCatalogList } from "./SanityCatalogList";
import type { SanityCatalogProduct } from "./sanityCatalogSource";

const getPage = vi.hoisted(() => vi.fn());
const loadOverlay = vi.hoisted(() => vi.fn());

vi.mock("./SanityProductDrawer", () => ({
  SanityProductDrawer: ({ open }: { open: boolean }) =>
    open ? <p>产品 Drawer 已打开</p> : null,
}));

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

  it("opens the product drawer when a catalog row is clicked", async () => {
    getPage.mockResolvedValue({ products: [product()] });

    const screen = await render(<SanityCatalogList />);

    await screen.getByRole("cell", { name: "RMK-100" }).click();
    await expect.element(screen.getByText("产品 Drawer 已打开")).toBeVisible();
  });

  it("uses the catalog image URL and replaces a failed image with a Chinese placeholder", async () => {
    getPage.mockResolvedValue({
      products: [
        product({
          sku: "005",
          images: [
            { url: "https://res.cloudinary.com/example/image/upload/005.jpg" },
          ],
        }),
      ],
    });

    const screen = await render(<SanityCatalogList />);

    const image = screen.getByRole("img", { name: "005 产品图片" });
    await expect
      .element(image)
      .toHaveAttribute(
        "src",
        "https://res.cloudinary.com/example/image/upload/005.jpg",
      );
    image.element().dispatchEvent(new Event("error"));
    await expect.element(screen.getByText("暂无产品图片")).toBeVisible();
  });

  it("uses the same Chinese placeholder when a product has no image URL", async () => {
    getPage.mockResolvedValue({ products: [product({ images: undefined })] });

    const screen = await render(<SanityCatalogList />);

    await expect.element(screen.getByText("暂无产品图片")).toBeVisible();
  });

  it("loads 50-product cursor pages forward and backward without changing the cursor chain", async () => {
    const first = product({ id: "first", sku: "001", skuSort: "001" });
    const second = product({ id: "second", sku: "051", skuSort: "051" });
    getPage.mockImplementation(({ after }) =>
      Promise.resolve(
        after
          ? { products: [second], nextCursor: undefined }
          : {
              products: [first],
              nextCursor: { skuSort: "001", id: "first" },
            },
      ),
    );

    const screen = await render(<SanityCatalogList />);

    await expect.element(screen.getByText("第 1 页 · 本页 1 条")).toBeVisible();
    await screen.getByRole("button", { name: "下一页" }).click();
    await expect.element(screen.getByText("第 2 页 · 本页 1 条")).toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "051" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "下一页" }))
      .toBeDisabled();
    await screen.getByRole("button", { name: "上一页" }).click();
    await expect
      .element(screen.getByRole("cell", { name: "001" }))
      .toBeVisible();
    expect(getPage).toHaveBeenLastCalledWith({
      search: "",
      includeUnpublished: false,
    });
  });

  it("resets to the first cursor page when the catalog search changes", async () => {
    getPage.mockResolvedValue({
      products: [product({ sku: "005", skuSort: "005" })],
    });

    const screen = await render(<SanityCatalogList />);

    await screen.getByRole("textbox", { name: "搜索产品" }).fill("005");
    await expect
      .poll(() => getPage.mock.calls.at(-1)?.[0])
      .toEqual({ search: "005", includeUnpublished: false });
    await expect
      .element(screen.getByRole("cell", { name: "005" }))
      .toBeVisible();
    await expect.element(screen.getByText("第 1 页 · 本页 1 条")).toBeVisible();
  });

  it("keeps the 1,801-product cursor chain reachable across all 37 UI pages", async () => {
    const allProducts = Array.from({ length: 1801 }, (_, index) =>
      product({
        id: `sanity-${index}`,
        sku: `SKU-${String(index).padStart(4, "0")}`,
        skuSort: `SKU-${String(index).padStart(4, "0")}`,
      }),
    );
    getPage.mockImplementation(({ after }) => {
      const start = after ? Number(after.id.replace("sanity-", "")) + 1 : 0;
      const products = allProducts.slice(start, start + 50);
      const last = products.at(-1);
      return Promise.resolve({
        products,
        nextCursor:
          start + 50 < allProducts.length && last
            ? { skuSort: last.skuSort, id: last.id }
            : undefined,
      });
    });

    const screen = await render(<SanityCatalogList />);

    for (let page = 1; page < 37; page += 1) {
      await expect
        .element(screen.getByText(`第 ${page} 页 · 本页 50 条`))
        .toBeVisible();
      await screen.getByRole("button", { name: "下一页" }).click();
    }
    await expect
      .element(screen.getByText("第 37 页 · 本页 1 条"))
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "SKU-1800" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "下一页" }))
      .toBeDisabled();
    expect(getPage).toHaveBeenCalledTimes(37);
    expect(
      new Set(
        getPage.mock.calls.map(([filter]) => filter.after?.id).filter(Boolean),
      ).size,
    ).toBe(36);
  });
});
