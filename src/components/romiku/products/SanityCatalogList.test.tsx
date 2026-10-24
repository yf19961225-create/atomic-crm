import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { useState } from "react";
import { SanityCatalogList } from "./SanityCatalogList";
import type { SanityCatalogProduct } from "./sanityCatalogSource";

const getPage = vi.hoisted(() => vi.fn());
const loadOverlay = vi.hoisted(() => vi.fn());
const loadWebsiteImages = vi.hoisted(() => vi.fn());

const FakeDrawer = ({
    open,
    imageCandidates,
  }: {
    open: boolean;
    imageCandidates?: string[];
  }) => {
    const [index, setIndex] = useState(0);
    return open ? (
      <>
        <p>产品 Drawer 已打开</p>
        {imageCandidates?.[index] ? (
          <img alt="Drawer 产品图片" src={imageCandidates[index]} />
        ) : (
          <p>Drawer 暂无产品图片</p>
        )}
        {imageCandidates?.[index] && (
          <button onClick={() => setIndex((value) => value + 1)}>
            模拟图片加载失败
          </button>
        )}
      </>
    ) : null;
  };

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

vi.mock("./websiteProductImages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./websiteProductImages")>()),
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

    const screen = await render(<SanityCatalogList catalogSource={{ getPage }} overlayLoader={loadOverlay} imageLoader={loadWebsiteImages} DrawerComponent={FakeDrawer} />);

    await expect
      .element(screen.getByRole("cell", { name: "RMK-100", exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "24", exact: true }))
      .toBeVisible();
    expect(
      screen.getByRole("table").element().querySelectorAll("col"),
    ).toHaveLength(9);
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

    const screen = await render(<SanityCatalogList catalogSource={{ getPage }} overlayLoader={loadOverlay} imageLoader={loadWebsiteImages} DrawerComponent={FakeDrawer} />);

    await expect
      .element(screen.getByRole("cell", { name: "—", exact: true }).first())
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "—", exact: true }).first())
      .toBeVisible();
  });

  it("selects only loaded products and clears selection when paging", async () => {
    getPage
      .mockResolvedValueOnce({ products: [product()], nextCursor: { skuSort: "RMK-100", id: "sanity-1" } })
      .mockResolvedValueOnce({ products: [product({ id: "sanity-2", sku: "RMK-200", skuSort: "RMK-200" })] })
      .mockResolvedValue({ products: [product()], nextCursor: { skuSort: "RMK-100", id: "sanity-1" } });
    const screen = await render(<SanityCatalogList catalogSource={{ getPage }} overlayLoader={loadOverlay} imageLoader={loadWebsiteImages} DrawerComponent={FakeDrawer} />);
    await expect.element(screen.getByRole("cell", { name: "RMK-100", exact: true })).toBeVisible();
    await screen.getByLabelText("全选当前页面").click();
    await expect.element(screen.getByText("已选择 1 个产品")).toBeVisible();
    await screen.getByRole("button", { name: "下一页" }).click();
    await expect.element(screen.getByRole("cell", { name: "RMK-200", exact: true })).toBeVisible();
    expect(screen.getByText("已选择 1 个产品")).not.toBeInTheDocument();
    await screen.getByLabelText("选择 RMK-200").click();
    await expect.element(screen.getByText("已选择 1 个产品")).toBeVisible();
    await screen.getByRole("button", { name: "上一页" }).click();
    await expect.element(screen.getByRole("cell", { name: "RMK-100", exact: true })).toBeVisible();
    expect(screen.getByText("已选择 1 个产品")).not.toBeInTheDocument();
  });

  it("keeps manual search and clears selection when a new search is submitted", async () => {
    getPage.mockResolvedValue({ products: [product()] });
    const screen = await render(<SanityCatalogList catalogSource={{ getPage }} overlayLoader={loadOverlay} imageLoader={loadWebsiteImages} DrawerComponent={FakeDrawer} />);
    await expect.element(screen.getByRole("cell", { name: "RMK-100", exact: true })).toBeVisible();
    await screen.getByLabelText("选择 RMK-100").click();
    await expect.element(screen.getByText("已选择 1 个产品")).toBeVisible();
    const input = screen.getByRole("searchbox", { name: "搜索产品" });
    await input.fill("RMK");
    expect(getPage).toHaveBeenCalledTimes(1);
    await expect.element(screen.getByText("已选择 1 个产品")).toBeVisible();
    await screen.getByRole("button", { name: "搜索", exact: true }).click();
    expect(screen.getByText("已选择 1 个产品")).not.toBeInTheDocument();
  });

  it("shows a Chinese error message when the read-only catalog request fails", async () => {
    getPage.mockRejectedValue(new Error("Sanity unavailable"));

    const screen = await render(<SanityCatalogList catalogSource={{ getPage }} overlayLoader={loadOverlay} imageLoader={loadWebsiteImages} DrawerComponent={FakeDrawer} />);

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

    const screen = await render(<SanityCatalogList catalogSource={{ getPage }} overlayLoader={loadOverlay} imageLoader={loadWebsiteImages} DrawerComponent={FakeDrawer} />);

    await expect
      .element(screen.getByRole("cell", { name: "华东供应商 +1" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "30", exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "50 × 40 × 30 cm", exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "0.060 m³", exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "12.5 kg", exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "确认包装颜色", exact: true }))
      .toBeVisible();
  });

  it("keeps Sanity products visible when no procurement records are associated", async () => {
    getPage.mockResolvedValue({ products: [product()] });
    loadOverlay.mockResolvedValue(
      new Map([["sanity-1", { supplierCount: 0 }]]),
    );

    const screen = await render(<SanityCatalogList catalogSource={{ getPage }} overlayLoader={loadOverlay} imageLoader={loadWebsiteImages} DrawerComponent={FakeDrawer} />);

    await expect
      .element(screen.getByRole("cell", { name: "RMK-100", exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "—", exact: true }).last())
      .toBeVisible();
  });

  it("isolates an overlay failure to procurement columns", async () => {
    getPage.mockResolvedValue({ products: [product()] });
    loadOverlay.mockRejectedValue(new Error("Supabase unavailable"));

    const screen = await render(<SanityCatalogList catalogSource={{ getPage }} overlayLoader={loadOverlay} imageLoader={loadWebsiteImages} DrawerComponent={FakeDrawer} />);

    await expect
      .element(screen.getByRole("cell", { name: "RMK-100", exact: true }))
      .toBeVisible();
    await expect
      .element(screen.getByText("暂时无法加载").first())
      .toBeVisible();
  });

  it("opens the product drawer when a catalog row is clicked", async () => {
    getPage.mockResolvedValue({ products: [product()] });

    const screen = await render(<SanityCatalogList catalogSource={{ getPage }} overlayLoader={loadOverlay} imageLoader={loadWebsiteImages} DrawerComponent={FakeDrawer} />);

    await screen.getByRole("cell", { name: "RMK-100", exact: true }).click();
    await expect.element(screen.getByText("产品 Drawer 已打开")).toBeVisible();
  });

  it("passes the exact-SKU website thumbnail first to the drawer without another image request", async () => {
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

    const screen = await render(<SanityCatalogList catalogSource={{ getPage }} overlayLoader={loadOverlay} imageLoader={loadWebsiteImages} DrawerComponent={FakeDrawer} />);

    await screen.getByRole("cell", { name: "005", exact: true }).click();
    await expect
      .element(screen.getByRole("img", { name: "Drawer 产品图片" }))
      .toHaveAttribute("src", resolvedImageUrl);
    expect(loadWebsiteImages).toHaveBeenCalledTimes(1);
  });

  it("falls back to Sanity when the matching website image fails", async () => {
    const website = new URL("/appIcon/152.png", location.href).href;
    const sanity = new URL("/appIcon/144.png", location.href).href;
    loadWebsiteImages.mockResolvedValue(
      new Map([["sanity-1", website]]),
    );
    getPage.mockResolvedValue({
      products: [
        product({
          sku: "005",
          images: [
            { url: sanity },
          ],
        }),
      ],
    });

    const screen = await render(<SanityCatalogList catalogSource={{ getPage }} overlayLoader={loadOverlay} imageLoader={loadWebsiteImages} DrawerComponent={FakeDrawer} />);

    const image = screen.getByRole("img", { name: "005 图片" });
    await expect
      .element(image)
      .toHaveAttribute(
        "src",
        website,
      );
    image.element().dispatchEvent(new Event("error"));
    await expect
      .element(screen.getByRole("img", { name: "005 图片" }))
      .toHaveAttribute(
        "src",
        sanity,
      );
  });

  it("passes the next same-SKU image into the open drawer after its website image fails", async () => {
    const primary = new URL("/appIcon/152.png", location.href).href;
    const fallback = new URL("/appIcon/144.png", location.href).href;
    loadWebsiteImages.mockResolvedValue(new Map([["sanity-1", fallback]]));
    getPage.mockResolvedValue({
      products: [product({ images: [{ url: primary }] })],
    });
    const screen = await render(<SanityCatalogList catalogSource={{ getPage }} overlayLoader={loadOverlay} imageLoader={loadWebsiteImages} DrawerComponent={FakeDrawer} />);
    await screen.getByRole("cell", { name: "RMK-100", exact: true }).click();
    await expect
      .element(screen.getByRole("img", { name: "Drawer 产品图片" }))
      .toHaveAttribute("src", fallback);
    await screen.getByRole("button", { name: "模拟图片加载失败" }).click();
    await expect
      .element(screen.getByRole("img", { name: "Drawer 产品图片" }))
      .toHaveAttribute("src", primary);
  });

  it("uses the same Chinese placeholder when a product has no image URL", async () => {
    getPage.mockResolvedValue({ products: [product({ images: undefined })] });

    const screen = await render(<SanityCatalogList catalogSource={{ getPage }} overlayLoader={loadOverlay} imageLoader={loadWebsiteImages} DrawerComponent={FakeDrawer} />);

    await expect
      .element(screen.getByRole("cell", { name: "暂无图片", exact: true }).first())
      .toBeVisible();
  });

  it("passes a server-side search query through to the catalog source", async () => {
    const first = product({ id: "first", sku: "001", skuSort: "001" });
    getPage.mockResolvedValue({ products: [first] });

    const screen = await render(<SanityCatalogList catalogSource={{ getPage }} overlayLoader={loadOverlay} imageLoader={loadWebsiteImages} DrawerComponent={FakeDrawer} />);

    const input = screen.getByRole("searchbox", { name: "搜索产品" });
    for (const value of ["0", "00", "001"]) await input.fill(value);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(getPage).toHaveBeenCalledTimes(1);
    await screen.getByRole("button", { name: "搜索", exact: true }).click();
    await expect
      .poll(() => getPage.mock.calls.at(-1)?.[0])
      .toEqual({
        search: "001",
        includeUnpublished: false,
      });
    await expect
      .element(screen.getByRole("cell", { name: "001", exact: true }))
      .toBeVisible();
  });

  it("keeps previous rows through a pending and failed search, then clears to the default list", async () => {
    let rejectSearch: ((reason: Error) => void) | undefined;
    const first = product({ id: "first", sku: "OLD" });
    getPage.mockImplementation(({ search }: { search: string }) =>
      search === "new"
        ? new Promise((_, reject) => {
            rejectSearch = reject;
          })
        : Promise.resolve({ products: [first] }),
    );
    const screen = await render(<SanityCatalogList catalogSource={{ getPage }} overlayLoader={loadOverlay} imageLoader={loadWebsiteImages} DrawerComponent={FakeDrawer} />);
    await expect
      .element(screen.getByRole("cell", { name: "OLD", exact: true }))
      .toBeVisible();
    await screen.getByRole("searchbox", { name: "搜索产品" }).fill("new");
    await screen.getByRole("button", { name: "搜索", exact: true }).click();
    await expect
      .element(screen.getByRole("cell", { name: "OLD", exact: true }))
      .toBeVisible();
    await expect.element(screen.getByRole("status")).toBeVisible();
    rejectSearch?.(new Error("offline"));
    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("搜索失败");
    await expect
      .element(screen.getByRole("cell", { name: "OLD", exact: true }))
      .toBeVisible();
    await screen.getByRole("button", { name: "清空" }).click();
    await expect
      .element(screen.getByRole("searchbox", { name: "搜索产品" }))
      .toHaveValue("");
    await expect
      .element(screen.getByRole("cell", { name: "OLD", exact: true }))
      .toBeVisible();
    expect(getPage.mock.calls.at(-1)?.[0]).toEqual({
      search: "",
      includeUnpublished: false,
    });
  });

  it("replaces the catalog result when the server-side search changes", async () => {
    getPage.mockResolvedValue({
      products: [product({ sku: "005", skuSort: "005" })],
    });

    const screen = await render(<SanityCatalogList catalogSource={{ getPage }} overlayLoader={loadOverlay} imageLoader={loadWebsiteImages} DrawerComponent={FakeDrawer} />);

    await screen.getByRole("searchbox", { name: "搜索产品" }).fill("005");
    expect(getPage).toHaveBeenCalledTimes(1);
    await screen.getByRole("button", { name: "搜索", exact: true }).click();
    await expect
      .poll(() => getPage.mock.calls.at(-1)?.[0])
      .toEqual({ search: "005", includeUnpublished: false });
    await expect
      .element(screen.getByRole("cell", { name: "005", exact: true }))
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

    const screen = await render(<SanityCatalogList catalogSource={{ getPage }} overlayLoader={loadOverlay} imageLoader={loadWebsiteImages} DrawerComponent={FakeDrawer} />);

    await expect
      .element(screen.getByRole("cell", { name: "SKU-0050", exact: true }))
      .toBeVisible();
  });
});
