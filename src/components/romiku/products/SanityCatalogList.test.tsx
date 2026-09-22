import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { SanityCatalogList } from "./SanityCatalogList";
import type { SanityCatalogProduct } from "./sanityCatalogSource";

const getPage = vi.hoisted(() => vi.fn());
const loadOverlay = vi.hoisted(() => vi.fn());
const loadWebsiteImages = vi.hoisted(() => vi.fn());

vi.mock("./SanityProductDrawer", () => ({
  SanityProductDrawer: ({
    open,
    resolvedImageUrl,
  }: {
    open: boolean;
    resolvedImageUrl?: string;
  }) =>
    open ? (
      <>
        <p>产品 Drawer 已打开</p>
        {resolvedImageUrl ? (
          <img alt="Drawer 产品图片" src={resolvedImageUrl} />
        ) : (
          <p>Drawer 暂无产品图片</p>
        )}
      </>
    ) : null,
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

vi.mock("./websiteProductImages", () => ({
  loadWebsiteProductImages: loadWebsiteImages,
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
    loadWebsiteImages.mockReset().mockResolvedValue(new Map());
  });

  it("renders the compact procurement columns returned for the catalog page", async () => {
    getPage.mockResolvedValue({ products: [product()] });

    const screen = await render(<SanityCatalogList />);

    await expect
      .element(screen.getByRole("cell", { name: "RMK-100" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "24" }))
      .toBeVisible();
    expect(
      screen.getByRole("table").element().querySelectorAll("col"),
    ).toHaveLength(8);
    for (const label of [
      "图片",
      "货号",
      "装箱数",
      "箱规",
      "体积",
      "重量",
      "供应商",
      "产品备注",
    ]) {
      await expect
        .element(screen.getByText(label, { exact: true }))
        .toBeVisible();
    }
  });

  it("keeps the catalog readable when optional Sanity fields are missing", async () => {
    loadWebsiteImages.mockResolvedValue(
      new Map([
        ["sanity-1", "https://romiku.com/images/products-local/005_main1.jpg"],
      ]),
    );
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
      .element(screen.getByRole("cell", { name: "—" }).first())
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

  it("uses the preferred supplier's procurement data in the compact columns", async () => {
    getPage.mockResolvedValue({ products: [product()] });
    loadOverlay.mockResolvedValue(
      new Map([
        [
          "sanity-1",
          {
            supplierCount: 2,
            preferredSupplier: "华东供应商",
            qtyPerCarton: 30,
            lengthCm: 50,
            widthCm: 40,
            heightCm: 30,
            cartonWeightKg: 12.5,
            internalNotes: "确认包装颜色",
          },
        ],
      ]),
    );

    const screen = await render(<SanityCatalogList />);

    await expect
      .element(screen.getByRole("cell", { name: "华东供应商 +1" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "30", exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "50 × 40 × 30 cm" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "0.060 m³" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "12.5 kg" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "确认包装颜色" }))
      .toBeVisible();
  });

  it("keeps Sanity products visible when no procurement records are associated", async () => {
    getPage.mockResolvedValue({ products: [product()] });
    loadOverlay.mockResolvedValue(
      new Map([["sanity-1", { supplierCount: 0 }]]),
    );

    const screen = await render(<SanityCatalogList />);

    await expect
      .element(screen.getByRole("cell", { name: "RMK-100" }))
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
      .element(screen.getByRole("cell", { name: "RMK-100" }))
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

  it("passes the catalog-resolved image URL to the drawer without another image request", async () => {
    const resolvedImageUrl =
      "https://romiku.com/images/products-local/005_main1.jpg";
    loadWebsiteImages.mockResolvedValue(
      new Map([["sanity-1", resolvedImageUrl]]),
    );
    getPage.mockResolvedValue({
      products: [
        product({
          sku: "005",
          images: [{ url: "https://sanity.example.test/005.jpg" }],
        }),
      ],
    });

    const screen = await render(<SanityCatalogList />);

    await screen.getByRole("cell", { name: "005", exact: true }).click();
    await expect
      .element(screen.getByRole("img", { name: "Drawer 产品图片" }))
      .toHaveAttribute("src", resolvedImageUrl);
    expect(loadWebsiteImages).toHaveBeenCalledTimes(1);
  });

  it("uses the catalog image URL and replaces a failed image with a Chinese placeholder", async () => {
    loadWebsiteImages.mockResolvedValue(
      new Map([
        ["sanity-1", "https://romiku.com/images/products-local/005_main1.jpg"],
      ]),
    );
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

    const image = screen.getByRole("img", { name: "005 图片" });
    await expect
      .element(image)
      .toHaveAttribute(
        "src",
        "https://romiku.com/images/products-local/005_main1.jpg",
      );
    image.element().dispatchEvent(new Event("error"));
    await expect
      .element(screen.getByRole("cell", { name: "—" }).first())
      .toBeVisible();
  });

  it("uses the same Chinese placeholder when a product has no image URL", async () => {
    getPage.mockResolvedValue({ products: [product({ images: undefined })] });

    const screen = await render(<SanityCatalogList />);

    await expect
      .element(screen.getByRole("cell", { name: "—" }).first())
      .toBeVisible();
  });

  it("passes a server-side search query through to the catalog source", async () => {
    const first = product({ id: "first", sku: "001", skuSort: "001" });
    getPage.mockResolvedValue({ products: [first] });

    const screen = await render(<SanityCatalogList />);

    await screen.getByRole("textbox", { name: "搜索产品" }).fill("001");
    await expect
      .poll(() => getPage.mock.calls.at(-1)?.[0])
      .toEqual({
        search: "001",
        includeUnpublished: false,
      });
    await expect
      .element(screen.getByRole("cell", { name: "001" }))
      .toBeVisible();
  });

  it("replaces the catalog result when the server-side search changes", async () => {
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
  });

  it("does not impose a client-side product limit on a server result", async () => {
    const products = Array.from({ length: 51 }, (_, index) =>
      product({
        id: `sanity-${index}`,
        sku: `SKU-${String(index).padStart(4, "0")}`,
        skuSort: `SKU-${String(index).padStart(4, "0")}`,
      }),
    );
    getPage.mockResolvedValue({ products });

    const screen = await render(<SanityCatalogList />);

    await expect
      .element(screen.getByRole("cell", { name: "SKU-0050" }))
      .toBeVisible();
  });
});
