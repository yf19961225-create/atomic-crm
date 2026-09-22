import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { SanityProductDrawer } from "./SanityProductDrawer";
import type {
  ProductDrawerClient,
  ProductDrawerReadClient,
} from "./productDrawerActions";
import type { SanityCatalogProduct } from "./sanityCatalogSource";

const product: SanityCatalogProduct = {
  id: "sanity-1",
  skuSort: "RMK-100",
  sku: "RMK-100",
  isPublished: true,
  images: [{ url: "https://example.test/product.jpg" }],
  name: { zh: "收纳盒", en: "Storage box", es: "Caja" },
  category: { title: { zh: "收纳" } },
  parameters: [{ label: { zh: "材质" }, value: "PP" }],
  moqQuantity: 120,
  moqUnit: { zh: "个" },
  packaging: { zh: "彩盒" },
  cartonQty: 24,
};

const createClient = (): ProductDrawerClient & ProductDrawerReadClient => ({
  createExtension: vi.fn().mockResolvedValue(undefined),
  updateExtension: vi.fn().mockResolvedValue(undefined),
  createSupplier: vi.fn().mockResolvedValue(undefined),
  updateSupplier: vi.fn().mockResolvedValue(undefined),
  createCost: vi.fn().mockResolvedValue(undefined),
  getExtension: vi.fn().mockResolvedValue(null),
  getSuppliers: vi.fn().mockResolvedValue([]),
  getCosts: vi.fn().mockResolvedValue([]),
  getSupplierOptions: vi
    .fn()
    .mockResolvedValue([{ id: "supplier-a", name: "华东供应商" }]),
});

describe("SanityProductDrawer", () => {
  it("renders the loaded Sanity product read-only and never requests Sanity again", async () => {
    const client = createClient();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const screen = await render(
      <SanityProductDrawer
        product={product}
        open
        onOpenChange={vi.fn()}
        refreshOverlay={vi.fn()}
        client={client}
      />,
    );

    await expect.element(screen.getByText("收纳盒").first()).toBeVisible();
    await expect.element(screen.getByText("Storage box")).toBeVisible();
    await expect.element(screen.getByText("Caja")).toBeVisible();
    await expect.element(screen.getByText("材质：PP")).toBeVisible();
    await expect.element(screen.getByText("已发布")).toBeVisible();
    await expect.element(screen.getByPlaceholder("Qty/Ctn")).toBeVisible();
    await expect.element(screen.getByPlaceholder("长 cm")).toBeVisible();
    await expect.element(screen.getByPlaceholder("单箱重量 kg")).toBeVisible();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses the resolved website image and ignores a Sanity image URL", async () => {
    const screen = await render(
      <SanityProductDrawer
        product={product}
        resolvedImageUrl="https://romiku.com/images/products-local/rmk-100.jpg"
        open
        onOpenChange={vi.fn()}
        refreshOverlay={vi.fn()}
        client={createClient()}
      />,
    );

    await expect
      .element(screen.getByRole("img", { name: "RMK-100 产品图片" }))
      .toHaveAttribute(
        "src",
        "https://romiku.com/images/products-local/rmk-100.jpg",
      );
    expect(screen.getByText("暂无产品图片")).not.toBeInTheDocument();
  });

  it("shows the image fallback when the website resolver has no image", async () => {
    const screen = await render(
      <SanityProductDrawer
        product={product}
        resolvedImageUrl={undefined}
        open
        onOpenChange={vi.fn()}
        refreshOverlay={vi.fn()}
        client={createClient()}
      />,
    );

    await expect.element(screen.getByText("暂无产品图片")).toBeVisible();
  });

  it("replaces a failed website image with the same fallback", async () => {
    const screen = await render(
      <SanityProductDrawer
        product={product}
        resolvedImageUrl="https://romiku.com/images/products-local/missing.jpg"
        open
        onOpenChange={vi.fn()}
        refreshOverlay={vi.fn()}
        client={createClient()}
      />,
    );

    screen
      .getByRole("img", { name: "RMK-100 产品图片" })
      .element()
      .dispatchEvent(new Event("error"));
    await expect.element(screen.getByText("暂无产品图片")).toBeVisible();
  });

  it("creates the minimum Extension then refreshes only the current product overlay", async () => {
    const client = createClient();
    const refreshOverlay = vi.fn().mockResolvedValue(undefined);
    const screen = await render(
      <SanityProductDrawer
        product={product}
        open
        onOpenChange={vi.fn()}
        refreshOverlay={refreshOverlay}
        client={client}
      />,
    );

    await screen.getByLabelText("Internal Notes").fill("首次备注");
    await screen.getByRole("button", { name: "保存备注" }).click();

    await expect.element(screen.getByText("备注已保存。")).toBeVisible();
    expect(client.createExtension).toHaveBeenCalledWith({
      sku: "RMK-100",
      sanity_product_id: "sanity-1",
      internal_notes: "首次备注",
    });
    expect(refreshOverlay).toHaveBeenCalledWith(product);
  });
});
