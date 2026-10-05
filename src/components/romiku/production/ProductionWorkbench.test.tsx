import { QueryClient } from "@tanstack/react-query";
import { OrderProductionPanel } from "./OrderProductionPanel";
import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import {
  MemoryRouter,
  Routes,
  Route,
  createMemoryRouter,
  RouterProvider,
} from "react-router";
import { FulfillmentDetail, FulfillmentList } from "./FulfillmentPages";
import { ProductionCreate } from "./ProductionCreate";
const { rpc, readAllocations } = vi.hoisted(() => ({
  rpc: vi.fn(),
  readAllocations: vi.fn(),
}));
vi.mock("./productionAllocation", async (original) => ({
  ...(await original<typeof import("./productionAllocation")>()),
  readProductionAllocations: readAllocations,
}));
vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc }),
}));
async function setup(
  create = false,
  panel = false,
  list = false,
  dataRouter = false,
  replaceOnly = false,
  allocated = false,
) {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: { ok: true, id: "p" }, error: null });
  const provider = fakeRestDataProvider({
    romiku_orders: [
      {
        id: "o",
        document_number: "OD001",
        updated_at: "2026-10-04",
        counterparty_snapshot: { company: "Historical Buyer" },
        production_defaults_snapshot: {
          schema_version: 2,
          initialized_at: "2026-10-04",
          source: { kind: "manual" },
          small_label: { mode: "text", text: "Made in China" },
        },
      },
    ],
    romiku_order_items: [
      {
        id: "s1",
        order_id: "o",
        sku: "SUN5",
        quantity: 100,
        product_snapshot: { name: "Lamp", specification: "Original" },
      },
      {
        id: "s2",
        order_id: "o",
        sku: "G03",
        quantity: 100,
        product_snapshot: { name: "Gel" },
      },
    ],
    romiku_production_orders: [
      {
        id: "p",
        order_id: "o",
        document_number: "OD001-P01",
        status: "pending",
        updated_at: "2026-10-04",
        marking_snapshot: {
          schema_version: 2,
          initialized_at: "2026-10-04",
          source: { kind: "order", id: "o" },
          small_label: { mode: "text", text: "Made in China" },
        },
      },
    ],
    romiku_production_items: [
      {
        id: "l1",
        order_id: "o",
        production_order_id: "p",
        source_order_item_id: "s1",
        sku: "SUN5",
        quantity: 10,
        product_snapshot: { name: "Lamp", specification: "Original" },
        packaging_snapshot: {},
        marking_override: { mode: "inherit" },
      },
      {
        id: "l2",
        order_id: "o",
        production_order_id: "p",
        source_order_item_id: "s2",
        sku: "G03",
        quantity: 20,
        product_snapshot: { name: "Gel" },
        packaging_snapshot: {},
        marking_override: {
          mode: "append",
          labels: [{ mode: "text", text: "Barcode" }],
        },
      },
    ],
  });
  readAllocations.mockReset();
  const sources = (
    await provider.getList("romiku_order_items", {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "id", order: "ASC" },
      filter: {},
    })
  ).data;
  readAllocations.mockResolvedValue(
    sources.map((i) => ({
      ...i,
      ordered_quantity: 100,
      production_quantity: allocated && i.sku === "SUN5" ? 100 : 60,
      unallocated_quantity: allocated && i.sku === "SUN5" ? 0 : 40,
      allocations: [
        {
          id: "other",
          document_number: "OD001-P02",
          quantity: allocated && i.sku === "SUN5" ? 100 : 60,
        },
      ],
    })),
  );
  const parent = (await provider.getOne("romiku_orders", { id: "o" })).data;
  const getMany = vi.spyOn(provider, "getMany");
  if (replaceOnly) {
    const old = (await provider.getOne("romiku_production_items", { id: "l1" }))
      .data;
    await provider.update("romiku_production_items", {
      id: "l1",
      previousData: old,
      data: {
        marking_override: {
          mode: "replace",
          front_mark: { mode: "text", text: "PRIVATE FRONT" },
          labels: [],
          labeling_requirements: "Private placement",
        },
      },
    });
  }
  const cache = new QueryClient();
  const content = (
    <CoreAdminContext dataProvider={provider} queryClient={cache}>
      <Routes>
        <Route
          path="/orders/o"
          element={<OrderProductionPanel order={parent} />}
        />
        <Route
          path="/production"
          element={<FulfillmentList kind="production" />}
        />
        <Route path="/production/new" element={<ProductionCreate />} />
        <Route
          path="/production/:id"
          element={<FulfillmentDetail kind="production" />}
        />
      </Routes>
    </CoreAdminContext>
  );
  const initial = panel
    ? "/orders/o"
    : list
      ? "/production"
      : create
        ? "/production/new?order=o"
        : "/production/p";
  const router = createMemoryRouter([{ path: "*", element: content }], {
    initialEntries: ["/production", initial],
  });
  const screen = await render(
    dataRouter ? (
      <RouterProvider router={router} />
    ) : (
      <MemoryRouter initialEntries={[initial]}>{content}</MemoryRouter>
    ),
  );
  return { screen, provider, getMany, router, cache };
}
it("edits all products and common instructions in one session; Cancel performs no writes", async () => {
  const { screen } = await setup();
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await screen.getByLabelText("产品规格 SUN5", { exact: true }).fill("Changed");
  await screen.getByLabelText("总数量 G03", { exact: true }).fill("30");
  await screen
    .getByRole("button", { name: "编辑统一要求", exact: true })
    .click();
  await screen
    .getByLabelText("订单要求", { exact: true })
    .fill("Protect cartons");
  await screen.getByRole("button", { name: "取消", exact: true }).click();
  expect(rpc).not.toHaveBeenCalled();
  await expect
    .element(screen.getByText("Original", { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: "OD001", exact: true }))
    .toBeVisible();
  const customRow = screen.getByRole("row").filter({ hasText: "G03" });
  await expect.element(customRow).toHaveTextContent("Made in China");
  await expect
    .element(customRow)
    .toHaveTextContent("Barcode（附加标签，仅 CRM）");
});
it("submits shared and multi-row changes once, retaining draft after server failure", async () => {
  const { screen } = await setup();
  rpc.mockResolvedValue({
    data: { ok: false, message: "生产单已被其他操作更新，请刷新后重新编辑。" },
    error: null,
  });
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await screen.getByLabelText("产品规格 SUN5", { exact: true }).fill("Changed");
  await screen.getByLabelText("总数量 G03", { exact: true }).fill("30");
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("生产单已被其他操作更新");
  expect(rpc).toHaveBeenCalledOnce();
  const [name, args] = rpc.mock.calls[0];
  expect(name).toBe("romiku_save_production_workspace");
  expect(args.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "l1",
        product_snapshot: expect.objectContaining({ specification: "Changed" }),
      }),
      expect.objectContaining({ id: "l2", quantity: 30 }),
    ]),
  );
  await expect
    .element(screen.getByLabelText("产品规格 SUN5", { exact: true }))
    .toHaveValue("Changed");
});
it("stages creation, locks Order and opens the whole draft before any write", async () => {
  const { screen } = await setup(true);
  await expect
    .element(screen.getByRole("link", { name: "OD001", exact: true }))
    .toBeVisible();
  expect(
    screen.getByRole("combobox", { name: "订单", exact: true }).query(),
  ).toBeNull();
  await screen.getByLabelText("选择 SUN5", { exact: true }).click();
  await screen
    .getByRole("button", { name: "下一步：编辑整张生产单", exact: true })
    .click();
  await expect
    .element(screen.getByLabelText("产品规格 SUN5", { exact: true }))
    .toBeVisible();
  expect(rpc).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "取消", exact: true }).click();
  await expect
    .element(screen.getByLabelText("选择 SUN5", { exact: true }))
    .toBeVisible();
  expect(rpc).not.toHaveBeenCalled();
});

it("shows parent business numbers and saved customer in the global table with one parent batch", async () => {
  const { screen, getMany } = await setup(false, false, true);
  await expect
    .element(screen.getByRole("link", { name: "OD001", exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText("Historical Buyer", { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText("订单编号", { exact: true }))
    .toBeVisible();
  expect(
    screen.getByRole("link", { name: "o", exact: true }).query(),
  ).toBeNull();
  expect(getMany).toHaveBeenCalledOnce();
});
it("shows all Order children and previews sync targets; cancellation does not invoke a write", async () => {
  const { screen } = await setup(false, true);
  rpc.mockResolvedValue({
    data: {
      ok: true,
      token: "version",
      source_snapshot: { production_requirements: "Saved Order instructions" },
      order_document_number: "OD001",
      productions: [{ id: "p", document_number: "OD001-P01" }],
    },
    error: null,
  });
  await expect
    .element(screen.getByRole("link", { name: "P01", exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: "+ 新建生产单", exact: true }))
    .toHaveAttribute("href", "/production/new?order=o");
  await screen
    .getByRole("button", { name: "将订单当前统一要求同步到未完成生产单" })
    .click();
  await expect
    .element(screen.getByRole("alertdialog"))
    .toHaveTextContent("OD001-P01");
  await screen.getByRole("button", { name: "取消同步" }).click();
  expect(rpc).toHaveBeenCalledExactlyOnceWith(
    "romiku_sync_order_production_defaults",
    { source_order_id: "o", expected: null },
  );
});

it("blocks history Back until the editing session is explicitly discarded", async () => {
  const { screen, router } = await setup(false, false, false, true);
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await screen
    .getByLabelText("产品规格 SUN5", { exact: true })
    .fill("Keep my draft");
  await router.navigate(-1);
  await expect
    .element(
      screen.getByRole("alertdialog", { name: "尚有未保存的生产单修改" }),
    )
    .toBeVisible();
  await screen.getByRole("button", { name: "继续编辑", exact: true }).click();
  await expect
    .element(screen.getByLabelText("产品规格 SUN5", { exact: true }))
    .toHaveValue("Keep my draft");
  expect(rpc).not.toHaveBeenCalled();
});
it("shows resolved custom marks for replace-only overrides without falsely claiming inheritance", async () => {
  const { screen } = await setup(false, false, false, false, true);
  await screen
    .getByRole("button", { name: "特殊要求 SUN5", exact: true })
    .click();
  await expect
    .element(screen.getByText("PRIVATE FRONT", { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText("Private placement", { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText("使用产品独立要求", { exact: true }))
    .toBeVisible();
});

it("defaults partial allocation to remaining and disables only fully allocated products", async () => {
  const { screen } = await setup(true, false, false, false, false, true);
  await expect
    .element(screen.getByLabelText("选择 SUN5", { exact: true }))
    .toBeDisabled();
  await expect
    .element(screen.getByText("已全部安排", { exact: true }))
    .toBeVisible();
  await screen.getByLabelText("选择 G03", { exact: true }).click();
  await expect
    .element(screen.getByLabelText("生产数量 G03", { exact: true }))
    .toHaveValue(40);
  await expect
    .element(screen.getByLabelText("生产数量 G03", { exact: true }))
    .toHaveAttribute("max", "40");
  await screen.getByText("查看生产安排 G03", { exact: true }).click();
  await expect
    .element(screen.getByRole("link", { name: "OD001-P02", exact: true }))
    .toHaveAttribute("href", "/production/other");
  await screen.getByLabelText("生产数量 G03", { exact: true }).fill("41");
  await screen
    .getByRole("button", { name: "下一步：编辑整张生产单", exact: true })
    .click();
  await expect.element(screen.getByRole("alert")).toHaveTextContent("剩余");
  expect(rpc).not.toHaveBeenCalled();
});
it("shared instructions remain a summary during product editing until explicitly opened", async () => {
  const { screen } = await setup();
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  expect(screen.getByLabelText("正唛文字", { exact: true }).query()).toBeNull();
  expect(screen.getByLabelText("订单要求", { exact: true }).query()).toBeNull();
  await screen
    .getByRole("button", { name: "编辑统一要求", exact: true })
    .click();
  await expect
    .element(screen.getByLabelText("统一小标签文字", { exact: true }))
    .toHaveValue("Made in China");
  expect(screen.getByLabelText("正唛文字", { exact: true }).query()).toBeNull();
  await screen
    .getByLabelText("正唛显示方式", { exact: true })
    .selectOptions("text");
  await expect
    .element(screen.getByLabelText("正唛文字", { exact: true }))
    .toBeVisible();
  await screen
    .getByLabelText("正唛显示方式", { exact: true })
    .selectOptions("image");
  expect(screen.getByLabelText("正唛文字", { exact: true }).query()).toBeNull();
  await expect
    .element(screen.getByLabelText("正唛图片", { exact: true }))
    .toBeVisible();
  await screen
    .getByLabelText("正唛显示方式", { exact: true })
    .selectOptions("none");
  expect(screen.getByLabelText("正唛图片", { exact: true }).query()).toBeNull();
  await screen.getByRole("button", { name: "取消", exact: true }).click();
});
it("shows a detailed server blocker and cannot confirm excess", async () => {
  const { screen } = await setup();
  rpc.mockResolvedValue({
    data: {
      ok: false,
      code: "OVER_ASSIGNED",
      message: "生产安排超过订单数量，请调整本次数量后保存。",
      dependencies: [
        {
          sku: "SUN5",
          ordered_quantity: 100,
          other_quantity: 60,
          this_quantity: 50,
          total_quantity: 110,
          excess_quantity: 10,
          allocations: [
            { id: "other", document_number: "OD001-P02", quantity: 60 },
          ],
        },
      ],
    },
    error: null,
  });
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await screen.getByLabelText("总数量 SUN5", { exact: true }).fill("50");
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("其他生产单已安排：60");
  await expect.element(screen.getByRole("alert")).toHaveTextContent("超出：10");
  expect(
    screen.getByRole("button", { name: "确认超量并保存" }).query(),
  ).toBeNull();
  expect(rpc.mock.calls[0][1].header).not.toHaveProperty("allow_overassigned");
});

it("clears a selected product when refreshed allocations consume its remaining quantity", async () => {
  const { screen, cache } = await setup(true);
  await screen.getByLabelText("选择 SUN5", { exact: true }).click();
  readAllocations.mockResolvedValue([
    {
      id: "s1",
      sku: "SUN5",
      ordered_quantity: 100,
      production_quantity: 100,
      unallocated_quantity: 0,
      allocations: [
        { id: "other", document_number: "OD001-P02", quantity: 100 },
      ],
    },
  ]);
  await cache.invalidateQueries({ queryKey: ["production-allocations"] });
  await expect
    .element(screen.getByLabelText("选择 SUN5", { exact: true }))
    .toBeDisabled();
  await expect
    .element(screen.getByLabelText("选择 SUN5", { exact: true }))
    .not.toBeChecked();
  await expect
    .element(
      screen.getByRole("button", {
        name: "下一步：编辑整张生产单",
        exact: true,
      }),
    )
    .toBeDisabled();
});

it("returns shared requirements to read-only summary after a successful save", async () => {
  const { screen } = await setup();
  await screen
    .getByRole("button", { name: "编辑统一要求", exact: true })
    .click();
  await screen
    .getByLabelText("订单要求", { exact: true })
    .fill("Saved common requirements");
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("整张生产单已保存");
  expect(screen.getByLabelText("订单要求", { exact: true }).query()).toBeNull();
  await expect
    .element(screen.getByRole("button", { name: "编辑统一要求", exact: true }))
    .toBeVisible();
});

it("edits only the product small label in the whole session; cancel restores and save refreshes final text", async () => {
  const { screen, provider } = await setup();
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await screen
    .getByRole("button", { name: "特殊要求 SUN5", exact: true })
    .click();
  await screen.getByLabelText("产品小标签适用方式").selectOptions("override");
  await screen.getByLabelText("产品小标签文字").fill("Barcode SUN5");
  await expect
    .element(screen.getByRole("row").filter({ hasText: "SUN5" }))
    .toHaveTextContent("Barcode SUN5");
  await screen.getByRole("button", { name: "取消", exact: true }).click();
  expect(rpc).not.toHaveBeenCalled();
  await expect
    .element(screen.getByRole("row").filter({ hasText: "SUN5" }))
    .not.toHaveTextContent("Barcode SUN5");
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await screen
    .getByRole("button", { name: "特殊要求 SUN5", exact: true })
    .click();
  await screen.getByLabelText("产品小标签适用方式").selectOptions("override");
  await screen.getByLabelText("产品小标签文字").fill("Barcode SUN5");
  rpc.mockImplementation(async (_name, args) => {
    for (const line of args.items) {
      const previousData = (
        await provider.getOne("romiku_production_items", { id: line.id })
      ).data;
      await provider.update("romiku_production_items", {
        id: line.id,
        previousData,
        data: { marking_override: line.marking_override },
      });
    }
    return { data: { ok: true, id: "p" }, error: null };
  });
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  await expect.element(screen.getByText("整张生产单已保存。")).toBeVisible();
  await expect
    .element(screen.getByRole("row").filter({ hasText: "SUN5" }))
    .toHaveTextContent("Barcode SUN5");
  expect(
    (await provider.getOne("romiku_production_items", { id: "l1" })).data
      .marking_override.field_overrides.small_label.mark.text,
  ).toBe("Barcode SUN5");
});

it("removing an independent image label switches the field to none and remains saveable", async () => {
  const { screen } = await setup();
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await screen
    .getByRole("button", { name: "特殊要求 SUN5", exact: true })
    .click();
  await screen.getByLabelText("产品小标签适用方式").selectOptions("override");
  await screen.getByLabelText("产品小标签显示方式").selectOptions("image");
  await screen.getByRole("button", { name: "移除图片", exact: true }).click();
  await expect
    .element(screen.getByLabelText("产品小标签适用方式"))
    .toHaveValue("none");
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  expect(
    rpc.mock.calls.at(-1)?.[1].items[0].marking_override.field_overrides
      .small_label,
  ).toEqual({ mode: "none" });
});
