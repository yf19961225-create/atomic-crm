import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { MemoryRouter } from "react-router";
import { RecordContextProvider } from "ra-core";
import { ProductLibrary, ProductSupplierEditLink } from "./ProductLibrary";
import { romikuRoutes } from "../routes/RomikuRoutes";
import { ProductSupplierEdit } from "./ProductForms";
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
  it("opens the ProductSupplier relation editor with the relation id on a registered route", async () => {
    const screen = await render(
      <MemoryRouter>
        <RecordContextProvider value={{ id: "relation-123", supplier_id: "supplier-456" }}>
          <ProductSupplierEditLink />
        </RecordContextProvider>
      </MemoryRouter>,
    );
    await expect.element(screen.getByRole("link", { name: "编辑供应商关联" }))
      .toHaveAttribute("href", "/product-library/suppliers/relation-123/edit");
    const route = romikuRoutes.find((entry) => entry.props.path === "/product-library/suppliers/:id/edit");
    expect(route?.props.element.type).toBe(ProductSupplierEdit);
  });
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
