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
import {
  ProductSupplierActionError,
  type ProductSupplierManagementClient,
} from "./productSupplierManagementClient";

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
const managementClient = (): ProductSupplierManagementClient => ({
  save: vi.fn().mockResolvedValue({ ok: true }),
  replace: vi.fn().mockResolvedValue({ ok: true }),
  remove: vi.fn().mockResolvedValue({ ok: true }),
  previewBulk: vi.fn().mockResolvedValue({ ok: true }),
  applyBulk: vi.fn().mockResolvedValue({ ok: true }),
});

describe("product supplier actions", () => {
  it("locks supplier identity while editing procurement on the same relation", async () => {
    const client = createClient();
    const management = managementClient();
    vi.mocked(client.getSuppliers).mockResolvedValue([
      {
        id: "relation-1",
        supplier_id: "supplier-a",
        supplier_name: "华东供应商",
        active: true,
        moq: 10,
      },
    ]);
    const screen = await render(
      <SanityProductDrawer
        product={product}
        open
        onOpenChange={vi.fn()}
        refreshOverlay={vi.fn()}
        client={client}
        managementClient={management}
      />,
    );
    await screen.getByRole("button", { name: "编辑采购信息" }).click();
    await expect
      .element(screen.getByText("当前供应商：华东供应商").first())
      .toBeVisible();
    await screen.getByLabelText("编辑供应商起订量").fill("20");
    await screen.getByRole("button", { name: "保存采购信息" }).click();
    expect(management.save).toHaveBeenCalledWith(
      expect.objectContaining({ relationId: "relation-1", moq: 20 }),
    );
    expect(client.createSupplier).not.toHaveBeenCalled();
    expect(client.updateSupplier).not.toHaveBeenCalled();
  });

  it("uses an explicit replacement action and does not create a duplicate for an active target", async () => {
    const client = createClient();
    const management = managementClient();
    vi.mocked(client.getSuppliers).mockResolvedValue([
      {
        id: "relation-1",
        supplier_id: "supplier-a",
        supplier_name: "华东供应商",
        active: true,
      },
    ]);
    vi.mocked(client.getSupplierOptions).mockResolvedValue([
      { id: "supplier-a", name: "华东供应商" },
      { id: "supplier-b", name: "目标供应商" },
    ]);
    vi.mocked(management.replace).mockRejectedValueOnce(
      new ProductSupplierActionError("ALREADY_LINKED"),
    );
    const screen = await render(
      <SanityProductDrawer
        product={product}
        open
        onOpenChange={vi.fn()}
        refreshOverlay={vi.fn()}
        client={client}
        managementClient={management}
      />,
    );
    await screen.getByRole("button", { name: "更换供应商" }).click();
    await screen.getByLabelText("目标供应商").selectOptions("supplier-b");
    await screen.getByRole("button", { name: "确认更换供应商" }).click();
    await expect
      .element(screen.getByText("该供应商已经关联此产品。"))
      .toBeVisible();
    expect(management.replace).toHaveBeenCalledWith(
      "relation-1",
      "supplier-b",
      false,
    );
  });

  it("requires confirmation before controlled delete", async () => {
    const client = createClient();
    const management = managementClient();
    vi.mocked(client.getSuppliers).mockResolvedValue([
      {
        id: "relation-1",
        supplier_id: "supplier-a",
        supplier_name: "华东供应商",
        active: true,
      },
    ]);
    const confirm = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const screen = await render(
      <SanityProductDrawer
        product={product}
        open
        onOpenChange={vi.fn()}
        refreshOverlay={vi.fn()}
        client={client}
        managementClient={management}
      />,
    );
    await screen.getByRole("button", { name: "删除关联" }).click();
    expect(management.remove).not.toHaveBeenCalled();
    await screen.getByRole("button", { name: "删除关联" }).click();
    expect(management.remove).toHaveBeenCalledWith("relation-1");
    confirm.mockRestore();
  });
});

describe("SanityProductDrawer", () => {
  it("uses Chinese labels throughout product details and displays manual cost sources in Chinese", async () => {
    const client = createClient();
    vi.mocked(client.getSuppliers).mockResolvedValue([
      {
        id: "relation-1",
        supplier_id: "supplier-a",
        supplier_name: "华东供应商",
      },
    ]);
    vi.mocked(client.getCosts).mockResolvedValue([
      {
        id: "cost-1",
        product_supplier_id: "relation-1",
        cost: 12,
        currency: "USD",
        effective_date: "2026-10-14",
        source_type: "manual",
      },
    ]);
    const screen = await render(
      <SanityProductDrawer
        product={product}
        open
        onOpenChange={vi.fn()}
        refreshOverlay={vi.fn()}
        client={client}
      />,
    );
    for (const label of [
      "供应商",
      "供应商货号",
      "供应商起订量",
      "交期",
      "首选供应商",
      "产品备注",
    ]) {
      await expect
        .element(screen.getByLabelText(label, { exact: true }))
        .toBeVisible();
    }
    await expect.element(screen.getByText("参考成本 / 成本历史")).toBeVisible();
    await expect.element(screen.getByPlaceholder("参考成本")).toBeVisible();
    await expect.element(screen.getByText(/手动/)).toBeVisible();
    await expect
      .element(screen.getByPlaceholder("来源类型"))
      .toHaveValue("手动");
    expect(
      screen.getByText("Reference Cost / Cost History"),
    ).not.toBeInTheDocument();
  });
  it("submits the localized manual source using the existing internal value", async () => {
    const client = createClient();
    vi.mocked(client.getSuppliers).mockResolvedValue([
      {
        id: "relation-1",
        supplier_id: "supplier-a",
        supplier_name: "华东供应商",
      },
    ]);
    const screen = await render(
      <SanityProductDrawer
        product={product}
        open
        onOpenChange={vi.fn()}
        refreshOverlay={vi.fn()}
        client={client}
      />,
    );
    await screen
      .getByLabelText("供应商", { exact: true })
      .selectOptions("supplier-a");
    await screen.getByPlaceholder("参考成本").fill("12");
    await screen
      .getByLabelText("成本生效日期", { exact: true })
      .fill("2026-10-26");
    await screen.getByRole("button", { name: "新增参考成本" }).click();
    expect(client.createCost).toHaveBeenCalledWith(
      expect.objectContaining({ source_type: "manual" }),
    );
  });
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
    await expect.element(screen.getByLabelText("每箱数量")).toBeVisible();
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

  it("shows a failure state after its only image fails", async () => {
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

    await screen.getByLabelText("产品备注").fill("首次备注");
    await screen.getByRole("button", { name: "保存备注" }).click();

    await expect.element(screen.getByText("备注已保存。")).toBeVisible();
    expect(client.createExtension).toHaveBeenCalledWith({
      sku: "RMK-100",
      sanity_product_id: "sanity-1",
      internal_notes: "首次备注",
    });
    expect(refreshOverlay).toHaveBeenCalledWith(product);
  });

  it("saves all five packing defaults without selecting a supplier and reloads them", async () => {
    const client = createClient();
    let stored: {
      id: string;
      qty_per_carton: number | null;
      length_cm: number | null;
      width_cm: number | null;
      height_cm: number | null;
      carton_weight_kg: number | null;
    } | null = null;
    vi.mocked(client.createExtension).mockImplementation(async (value) => {
      stored = {
        id: "extension-1",
        qty_per_carton: value.qty_per_carton ?? null,
        length_cm: value.length_cm ?? null,
        width_cm: value.width_cm ?? null,
        height_cm: value.height_cm ?? null,
        carton_weight_kg: value.carton_weight_kg ?? null,
      };
    });
    vi.mocked(client.getExtension).mockImplementation(async () => stored);
    const view = await render(drawerWithObserver(client));
    await expect
      .element(view.getByTestId("draft-state"))
      .toHaveTextContent("false");
    for (const [label, value] of [
      ["每箱数量", "24"],
      ["长(cm)", "50"],
      ["宽(cm)", "40"],
      ["高(cm)", "35"],
      ["单箱重量(kg)", "12.5"],
    ]) {
      await view.getByLabelText(label).fill(value);
    }
    await expect
      .element(view.getByTestId("draft-state"))
      .toHaveTextContent("true");
    await view.getByRole("button", { name: "保存装箱信息" }).click();
    await expect.element(view.getByText("装箱信息已保存。")).toBeVisible();
    expect(client.createSupplier).not.toHaveBeenCalled();
    await expect
      .element(view.getByTestId("draft-state"))
      .toHaveTextContent("false");
    await view.rerender(drawerWithObserver(client, false));
    await view.rerender(drawerWithObserver(client));
    await expect.element(view.getByLabelText("每箱数量")).toHaveValue(24);
    await expect.element(view.getByLabelText("单箱重量(kg)")).toHaveValue(12.5);
    await expect
      .element(view.getByTestId("draft-state"))
      .toHaveTextContent("false");
  });

  it("saves product packing independently of an existing supplier override", async () => {
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

    await expect.element(screen.getByLabelText("每箱数量")).toHaveValue(null);
    await screen.getByLabelText("长(cm)").fill("50");
    await screen.getByLabelText("宽(cm)").fill("50");
    await screen.getByLabelText("高(cm)").fill("50");
    await screen.getByLabelText("单箱重量(kg)").fill("50");
    await screen.getByRole("button", { name: "保存装箱信息" }).click();

    expect(client.createExtension).toHaveBeenCalledWith(
      expect.objectContaining({
        sku: "RMK-100",
        length_cm: 50,
        width_cm: 50,
        height_cm: 50,
        carton_weight_kg: 50,
      }),
    );
    expect(client.updateSupplier).not.toHaveBeenCalled();
    await expect.element(screen.getByText("装箱信息已保存。")).toBeVisible();
  });

  it("keeps saved product defaults while creating and editing a supplier relation", async () => {
    const client = createClient();
    vi.mocked(client.getExtension).mockResolvedValue({
      id: "extension-1",
      qty_per_carton: 24,
      length_cm: 50,
      width_cm: 40,
      height_cm: 35,
      carton_weight_kg: 12.5,
    });
    const screen = await render(drawerWithObserver(client));
    await expect.element(screen.getByLabelText("每箱数量")).toHaveValue(24);
    await screen
      .getByLabelText("供应商", { exact: true })
      .selectOptions("supplier-a");
    await screen.getByLabelText("供应商货号").fill("SUP-24");
    await screen.getByLabelText("供应商起订量").fill("120");
    await screen.getByLabelText("交期").fill("10");
    await screen.getByRole("button", { name: "新增并保存供应商关联" }).click();
    expect(client.createSupplier).toHaveBeenCalledWith(
      expect.objectContaining({
        supplier_item_number: "SUP-24",
        moq: 120,
        lead_days: 10,
      }),
    );
    expect(client.createSupplier).toHaveBeenCalledWith(
      expect.not.objectContaining({
        qty_per_carton: expect.anything(),
      }),
    );
    expect(client.updateExtension).not.toHaveBeenCalled();
    await expect.element(screen.getByLabelText("每箱数量")).toHaveValue(24);
  });
});

const DraftObserver = () => (
  <output data-testid="draft-state">{String(useHasAppDraft())}</output>
);
const loadedClient = () => {
  const client = createClient();
  vi.mocked(client.getExtension).mockResolvedValue({
    id: "extension-1",
    qty_per_carton: 24,
  });
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
    await expect.element(screen.getByLabelText("每箱数量")).toHaveValue(24);
    await expect
      .element(screen.getByTestId("draft-state"))
      .toHaveTextContent("false");
    await screen.getByPlaceholder("参考成本").fill("12");
    await expect
      .element(screen.getByTestId("draft-state"))
      .toHaveTextContent("true");
    await screen.rerender(drawerWithObserver(client, false));
    await expect
      .element(screen.getByTestId("draft-state"))
      .toHaveTextContent("false");
    await screen.rerender(drawerWithObserver(client));
    await expect.element(screen.getByLabelText("每箱数量")).toHaveValue(24);
    await expect
      .element(screen.getByTestId("draft-state"))
      .toHaveTextContent("false");
  });

  it("returns to clean when supplier and cost values match their baselines", async () => {
    const screen = await render(drawerWithObserver(loadedClient()));
    await expect.element(screen.getByLabelText("每箱数量")).toHaveValue(24);
    await screen.getByLabelText("每箱数量").fill("25");
    await expect
      .element(screen.getByTestId("draft-state"))
      .toHaveTextContent("true");
    await screen.getByLabelText("每箱数量").fill("24.0");
    await expect
      .element(screen.getByTestId("draft-state"))
      .toHaveTextContent("false");
    await screen.getByPlaceholder("参考成本").fill("12");
    await screen.getByPlaceholder("参考成本").fill("");
    await expect
      .element(screen.getByTestId("draft-state"))
      .toHaveTextContent("false");
  });

  it("saving notes preserves independently dirty supplier and cost drafts", async () => {
    const screen = await render(drawerWithObserver(loadedClient()));
    await expect.element(screen.getByLabelText("每箱数量")).toHaveValue(24);
    await screen.getByLabelText("产品备注").fill("draft note");
    await screen.getByLabelText("每箱数量").fill("30");
    await screen.getByPlaceholder("参考成本").fill("12");
    await screen.getByRole("button", { name: "保存备注" }).click();
    await expect.element(screen.getByText("备注已保存。")).toBeVisible();
    await expect.element(screen.getByLabelText("每箱数量")).toHaveValue(30);
    await expect
      .element(screen.getByTestId("draft-state"))
      .toHaveTextContent("true");
    await screen.getByLabelText("每箱数量").fill("24");
    await screen
      .getByLabelText("成本生效日期", { exact: true })
      .fill("2026-10-26");
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
      qty_per_carton: number;
    }) => void;
    vi.mocked(client.getExtension).mockReturnValue(
      new Promise((resolve) => {
        resolveExtension = resolve;
      }),
    );
    const screen = await render(drawerWithObserver(client));
    await screen.getByLabelText("产品备注").fill("local draft");
    resolveExtension({
      id: "extension-1",
      internal_notes: "server note",
      qty_per_carton: 24,
    });
    await expect.element(screen.getByLabelText("每箱数量")).toHaveValue(24);
    await expect
      .element(screen.getByLabelText("产品备注"))
      .toHaveValue("local draft");
    await expect
      .element(screen.getByTestId("draft-state"))
      .toHaveTextContent("true");
    await screen.getByLabelText("产品备注").fill("server note");
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
  await expect.element(screen.getByLabelText("每箱数量")).toHaveValue(24);
  await screen.getByLabelText("产品备注").fill("submitted note");
  await screen.getByRole("button", { name: "保存备注" }).click();
  await screen.getByLabelText("产品备注").fill("newer note");
  resolveSave();
  await expect.element(screen.getByText("备注已保存。")).toBeVisible();
  await expect
    .element(screen.getByLabelText("产品备注"))
    .toHaveValue("newer note");
  await expect
    .element(screen.getByTestId("draft-state"))
    .toHaveTextContent("true");
  await screen.getByLabelText("产品备注").fill("submitted note");
  await expect
    .element(screen.getByTestId("draft-state"))
    .toHaveTextContent("false");
});

it("packing save clears only its source and leaves notes and cost drafts intact", async () => {
  const screen = await render(drawerWithObserver(loadedClient()));
  await expect.element(screen.getByLabelText("每箱数量")).toHaveValue(24);
  await screen.getByLabelText("产品备注").fill("unsaved note");
  await screen.getByPlaceholder("参考成本").fill("12");
  await screen.getByLabelText("每箱数量").fill("30");
  await screen.getByRole("button", { name: "保存装箱信息" }).click();
  await expect.element(screen.getByText("装箱信息已保存。")).toBeVisible();
  await expect
    .element(screen.getByLabelText("产品备注"))
    .toHaveValue("unsaved note");
  await expect.element(screen.getByPlaceholder("参考成本")).toHaveValue(12);
  await expect
    .element(screen.getByTestId("draft-state"))
    .toHaveTextContent("true");
  await screen.getByLabelText("产品备注").fill("");
  await screen.getByPlaceholder("参考成本").fill("");
  await expect
    .element(screen.getByTestId("draft-state"))
    .toHaveTextContent("false");
});

it("tracks invalid numeric keyboard input instead of treating it as untouched blank", async () => {
  const screen = await render(drawerWithObserver(loadedClient()));
  await expect.element(screen.getByLabelText("每箱数量")).toHaveValue(24);
  const cost = screen.getByPlaceholder("参考成本");
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

it("keeps explicit zero cost and packing values dirty until restored", async () => {
  const screen = await render(drawerWithObserver(loadedClient()));
  await expect.element(screen.getByLabelText("每箱数量")).toHaveValue(24);
  await screen.getByPlaceholder("参考成本").fill("0");
  await expect
    .element(screen.getByTestId("draft-state"))
    .toHaveTextContent("true");
  await screen.getByPlaceholder("参考成本").fill("");
  await screen.getByLabelText("长(cm)").fill("0");
  await expect
    .element(screen.getByTestId("draft-state"))
    .toHaveTextContent("true");
  await screen.getByLabelText("长(cm)").fill("");
  await expect
    .element(screen.getByTestId("draft-state"))
    .toHaveTextContent("false");
});

it("calendar-only cost date changes are dirty and clearing restores the exact clean draft", async () => {
  const screen = await render(drawerWithObserver(loadedClient()));
  await expect.element(screen.getByLabelText("每箱数量")).toHaveValue(24);
  await screen
    .getByRole("button", { name: "打开成本生效日期日历", exact: true })
    .click();
  await screen
    .getByLabelText("日历年份", { exact: true })
    .selectOptions("2026");
  await screen.getByLabelText("日历月份", { exact: true }).selectOptions("10");
  await screen.getByRole("button", { name: "2026-10-31", exact: true }).click();
  await expect
    .element(screen.getByTestId("draft-state"))
    .toHaveTextContent("true");
  // Native clearing and calendar selection both update the same controlled draft.
  await screen.getByLabelText("成本生效日期", { exact: true }).fill("");
  await expect
    .element(screen.getByTestId("draft-state"))
    .toHaveTextContent("false");
});
