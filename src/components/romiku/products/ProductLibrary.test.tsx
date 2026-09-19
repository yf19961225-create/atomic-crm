import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { MemoryRouter } from "react-router";
import { ProductLibrary } from "./ProductLibrary";
import type { SanityCatalogProduct } from "./sanityCatalogSource";

const getPage = vi.hoisted(() => vi.fn());

vi.mock("./sanityCatalogSource", () => ({
  createSanityCatalogSource: () => ({ getPage }),
}));

const catalogProduct: SanityCatalogProduct = {
  id: "sanity-1",
  skuSort: "RMK-100",
  isPublished: true,
  sku: "RMK-100",
  name: { zh: "产品目录中的产品", en: "Catalog product" },
};

describe("ProductLibrary", () => {
  beforeEach(() => {
    getPage.mockReset();
  });

  it("opens the product library on the Sanity-backed catalog while keeping CRM tabs available", async () => {
    getPage.mockResolvedValue({ products: [catalogProduct] });

    const screen = await render(
      <MemoryRouter>
        <ProductLibrary />
      </MemoryRouter>,
    );

    await expect
      .element(screen.getByRole("tab", { name: "产品目录" }))
      .toHaveAttribute("data-state", "active");
    await expect.element(screen.getByText("产品目录中的产品")).toBeVisible();
    await expect.element(screen.getByRole("tab", { name: "扩展信息" })).toBeVisible();
    await expect.element(screen.getByRole("tab", { name: "产品供应商" })).toBeVisible();
    await expect.element(screen.getByRole("tab", { name: "参考成本" })).toBeVisible();
  });
});
