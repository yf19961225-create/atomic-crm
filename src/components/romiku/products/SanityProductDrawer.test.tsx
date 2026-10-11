import { userEvent } from "vitest/browser";
import { useHasAppDraft } from "../updates/drafts";
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
    await expect.element(screen.getByLabelText("Qty/Ctn")).toBeVisible();
    await expect.element(screen.getByLabelText("长(cm)")).toBeVisible();
    await expect.element(screen.getByLabelText("单箱重量(kg)")).toBeVisible();
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

  it("updates an existing ProductSupplier procurement overlay", async () => {
    const client = createClient();
    vi.mocked(client.getSuppliers).mockResolvedValue([
      {
        id: "product-supplier-1",
        supplier_id: "supplier-a",
        supplier_name: "华东供应商",
        qty_per_carton: 24,
        preferred: true,
      },
    ]);
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

    await screen.getByRole("button", { name: "编辑" }).click();
    await screen.getByLabelText("长(cm)").fill("50");
    await screen.getByLabelText("宽(cm)").fill("50");
    await screen.getByLabelText("高(cm)").fill("50");
    await screen.getByLabelText("单箱重量(kg)").fill("50");
    await screen.getByRole("button", { name: "保存采购信息" }).click();

    expect(client.updateSupplier).toHaveBeenCalledWith(
      "product-supplier-1",
      expect.objectContaining({
        supplier_id: "supplier-a",
        length_cm: 50,
        width_cm: 50,
        height_cm: 50,
        carton_weight_kg: 50,
      }),
    );
    expect(client.createSupplier).not.toHaveBeenCalled();
    await expect.element(screen.getByText("采购信息已保存。")).toBeVisible();
  });
});

const DraftObserver = () => (
  <output data-testid="draft-state">{String(useHasAppDraft())}</output>
);
const loadedClient = () => {
  const client = createClient();
  vi.mocked(client.getSuppliers).mockResolvedValue([
    {
      id: "link-1",
      supplier_id: "supplier-a",
      qty_per_carton: 24,
      preferred: true,
    },
  ]);
  return client;
};
const drawerWithObserver = (
  client: ReturnType<typeof createClient>,
  open = true,
) => (
  <>
    <SanityProductDrawer
      product={open ? product : null}
      open={open}
      onOpenChange={vi.fn()}
      refreshOverlay={vi.fn().mockResolvedValue(undefined)}
      client={client}
    />
    <DraftObserver />
  </>
);

describe("product drawer draft lifecycle", () => {
  it("opens clean, tracks cost edits, clears on close and reopens clean", async () => {
    const client = loadedClient();
    const screen = await render(drawerWithObserver(client));
    await expect.element(screen.getByLabelText("Qty/Ctn")).toHaveValue(24);
    await expect
      .element(screen.getByTestId("draft-state"))
      .toHaveTextContent("false");
    await screen.getByPlaceholder("Reference Cost").fill("12");
    await expect
      .element(screen.getByTestId("draft-state"))
      .toHaveTextContent("true");
    await screen.rerender(drawerWithObserver(client, false));
    await expect
      .element(screen.getByTestId("draft-state"))
      .toHaveTextContent("false");
    await screen.rerender(drawerWithObserver(client));
    await expect.element(screen.getByLabelText("Qty/Ctn")).toHaveValue(24);
    await expect
      .element(screen.getByTestId("draft-state"))
      .toHaveTextContent("false");
  });

  it("returns to clean when supplier and cost values match their baselines", async () => {
    const screen = await render(drawerWithObserver(loadedClient()));
    await expect.element(screen.getByLabelText("Qty/Ctn")).toHaveValue(24);
    await screen.getByLabelText("Qty/Ctn").fill("25");
    await expect
      .element(screen.getByTestId("draft-state"))
      .toHaveTextContent("true");
    await screen.getByLabelText("Qty/Ctn").fill("24.0");
    await expect
      .element(screen.getByTestId("draft-state"))
      .toHaveTextContent("false");
    await screen.getByPlaceholder("Reference Cost").fill("12");
    await screen.getByPlaceholder("Reference Cost").fill("");
    await expect
      .element(screen.getByTestId("draft-state"))
      .toHaveTextContent("false");
  });

  it("saving notes preserves independently dirty supplier and cost drafts", async () => {
    const screen = await render(drawerWithObserver(loadedClient()));
    await expect.element(screen.getByLabelText("Qty/Ctn")).toHaveValue(24);
    await screen.getByLabelText("Internal Notes").fill("draft note");
    await screen.getByLabelText("Qty/Ctn").fill("30");
    await screen.getByPlaceholder("Reference Cost").fill("12");
    await screen.getByRole("button", { name: "保存备注" }).click();
    await expect.element(screen.getByText("备注已保存。")).toBeVisible();
    await expect.element(screen.getByLabelText("Qty/Ctn")).toHaveValue(30);
    await expect
      .element(screen.getByTestId("draft-state"))
      .toHaveTextContent("true");
    await screen.getByLabelText("Qty/Ctn").fill("24");
    await screen.getByRole("button", { name: "新增参考成本" }).click();
    await expect.element(screen.getByText("参考成本已保存。")).toBeVisible();
    await expect
      .element(screen.getByTestId("draft-state"))
      .toHaveTextContent("false");
  });

  it("late hydration preserves notes typed while loading", async () => {
    const client = loadedClient();
    let resolveExtension!: (value: {
      id: string;
      internal_notes: string;
    }) => void;
    vi.mocked(client.getExtension).mockReturnValue(
      new Promise((resolve) => {
        resolveExtension = resolve;
      }),
    );
    const screen = await render(drawerWithObserver(client));
    await screen.getByLabelText("Internal Notes").fill("local draft");
    resolveExtension({ id: "extension-1", internal_notes: "server note" });
    await expect.element(screen.getByLabelText("Qty/Ctn")).toHaveValue(24);
    await expect
      .element(screen.getByLabelText("Internal Notes"))
      .toHaveValue("local draft");
    await expect
      .element(screen.getByTestId("draft-state"))
      .toHaveTextContent("true");
    await screen.getByLabelText("Internal Notes").fill("server note");
    await expect
      .element(screen.getByTestId("draft-state"))
      .toHaveTextContent("false");
  });
});

it("keeps newer notes dirty when an earlier save finishes", async () => {
  const client = loadedClient();
  let resolveSave!: () => void;
  vi.mocked(client.createExtension).mockReturnValue(
    new Promise((resolve) => {
      resolveSave = () => resolve(undefined);
    }),
  );
  const screen = await render(drawerWithObserver(client));
  await expect.element(screen.getByLabelText("Qty/Ctn")).toHaveValue(24);
  await screen.getByLabelText("Internal Notes").fill("submitted note");
  await screen.getByRole("button", { name: "保存备注" }).click();
  await screen.getByLabelText("Internal Notes").fill("newer note");
  resolveSave();
  await expect.element(screen.getByText("备注已保存。")).toBeVisible();
  await expect
    .element(screen.getByLabelText("Internal Notes"))
    .toHaveValue("newer note");
  await expect
    .element(screen.getByTestId("draft-state"))
    .toHaveTextContent("true");
  await screen.getByLabelText("Internal Notes").fill("submitted note");
  await expect
    .element(screen.getByTestId("draft-state"))
    .toHaveTextContent("false");
});

it("supplier save clears only its source and leaves notes and cost drafts intact", async () => {
  const screen = await render(drawerWithObserver(loadedClient()));
  await expect.element(screen.getByLabelText("Qty/Ctn")).toHaveValue(24);
  await screen.getByLabelText("Internal Notes").fill("unsaved note");
  await screen.getByPlaceholder("Reference Cost").fill("12");
  await screen.getByLabelText("Qty/Ctn").fill("30");
  await screen.getByRole("button", { name: "保存采购信息" }).click();
  await expect.element(screen.getByText("采购信息已保存。")).toBeVisible();
  await expect
    .element(screen.getByLabelText("Internal Notes"))
    .toHaveValue("unsaved note");
  await expect
    .element(screen.getByPlaceholder("Reference Cost"))
    .toHaveValue(12);
  await expect
    .element(screen.getByTestId("draft-state"))
    .toHaveTextContent("true");
  await screen.getByLabelText("Internal Notes").fill("");
  await screen.getByPlaceholder("Reference Cost").fill("");
  await expect
    .element(screen.getByTestId("draft-state"))
    .toHaveTextContent("false");
});

it("tracks invalid numeric keyboard input instead of treating it as untouched blank", async () => {
  const screen = await render(drawerWithObserver(loadedClient()));
  await expect.element(screen.getByLabelText("Qty/Ctn")).toHaveValue(24);
  const cost = screen.getByPlaceholder("Reference Cost");
  await cost.click();
  await userEvent.keyboard("e");
  expect((cost.element() as HTMLInputElement).validity.badInput).toBe(true);
  await expect
    .element(screen.getByTestId("draft-state"))
    .toHaveTextContent("true");
  await cost.fill("");
  await expect
    .element(screen.getByTestId("draft-state"))
    .toHaveTextContent("false");
  const supplierNumber = screen.getByLabelText("长(cm)");
  await supplierNumber.click();
  await userEvent.keyboard("e");
  expect((supplierNumber.element() as HTMLInputElement).validity.badInput).toBe(
    true,
  );
  await expect
    .element(screen.getByTestId("draft-state"))
    .toHaveTextContent("true");
  await supplierNumber.fill("");
  await expect
    .element(screen.getByTestId("draft-state"))
    .toHaveTextContent("false");
});

it("keeps explicit zero cost dirty and normalizes supplier zero as its existing save does", async () => {
  const screen = await render(drawerWithObserver(loadedClient()));
  await expect.element(screen.getByLabelText("Qty/Ctn")).toHaveValue(24);
  await screen.getByPlaceholder("Reference Cost").fill("0");
  await expect
    .element(screen.getByTestId("draft-state"))
    .toHaveTextContent("true");
  await screen.getByPlaceholder("Reference Cost").fill("");
  await screen.getByLabelText("长(cm)").fill("0");
  await expect
    .element(screen.getByTestId("draft-state"))
    .toHaveTextContent("false");
});
