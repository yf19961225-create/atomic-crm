import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter, Routes } from "react-router";
import { page, userEvent } from "vitest/browser";
import { romikuRoutes } from "../routes/RomikuRoutes";
import { readRelated } from "../outbound/workflow";
import "@/index.css";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc }),
}));
async function setup(path: string) {
  await page.viewport(1440, 1200);
  const provider = fakeRestDataProvider({
    romiku_orders: [
      {
        id: "o",
        document_number: "SO-001",
        production_defaults_snapshot: {
          schema_version: 2,
          initialized_at: "2026-10-03",
          source: { kind: "manual" },
        },
        counterparty_snapshot: {
          company: "Saved Order Buyer",
          address: "Madrid",
        },
      },
    ],
    romiku_order_items: [
      {
        id: "i",
        order_id: "o",
        sku: "A",
        quantity: 100,
        product_snapshot: { name: "Lamp", unit: "PCS" },
        packing_snapshot: { cartons: 4 },
      },
      {
        id: "j",
        order_id: "o",
        sku: "B",
        quantity: 200,
        product_snapshot: { name: "Table" },
        packing_snapshot: {},
      },
    ],
    romiku_order_item_remaining: [
      {
        id: "i",
        order_id: "o",
        ordered_quantity: 100,
        packed_quantity: 40,
        remaining_quantity: 60,
      },
      {
        id: "j",
        order_id: "o",
        ordered_quantity: 200,
        packed_quantity: 0,
        remaining_quantity: 200,
      },
    ],
    romiku_suppliers: [
      { id: "s1", name: "Factory One" },
      { id: "s2", name: "Factory Two" },
    ],
    romiku_product_suppliers: [],
    romiku_production_orders: [],
    romiku_production_items: [],
    romiku_packing_lists: [
      { id: "p", document_number: "PL-001", order_id: "o" },
    ],
    romiku_packing_items: [
      {
        id: "packed-i",
        packing_list_id: "p",
        order_id: "o",
        source_order_item_id: "i",
        sku: "A",
        quantity: 20,
        cartons: 0,
        qty_per_carton: null,
        length_cm: 0,
        width_cm: 0,
        height_cm: 0,
        carton_weight_kg: 0,
        product_snapshot: { name: "Lamp", unit: "PCS" },
      },
    ],
  });
  rpc.mockImplementation(async (name, args) => {
    if (name === "romiku_production_allocations") {
      const sources = await readRelated(provider, "romiku_order_items", {
        order_id: args.source_order_id,
      });
      const productions = await readRelated(
        provider,
        "romiku_production_orders",
        { order_id: args.source_order_id },
      );
      const lines = await readRelated(provider, "romiku_production_items", {
        order_id: args.source_order_id,
      });
      return {
        data: sources.map((s) => {
          const allocations = productions
            .filter((p) => p.status !== "cancelled")
            .map((p) => ({
              id: p.id,
              document_number: p.document_number,
              quantity: lines
                .filter(
                  (i) =>
                    i.production_order_id === p.id &&
                    i.source_order_item_id === s.id,
                )
                .reduce((n, i) => n + Number(i.quantity), 0),
            }))
            .filter((a) => a.quantity > 0);
          const assigned = allocations.reduce((n, a) => n + a.quantity, 0);
          return {
            ...s,
            ordered_quantity: s.quantity,
            production_quantity: assigned,
            unallocated_quantity: s.quantity - assigned,
            allocations,
          };
        }),
        error: null,
      };
    }
    if (name !== "romiku_save_production_workspace")
      throw new Error("Unexpected RPC");
    let parent;
    if (args.production_id != null) {
      const old = (
        await provider.getOne("romiku_production_orders", {
          id: args.production_id,
        })
      ).data;
      parent = (
        await provider.update("romiku_production_orders", {
          id: old.id,
          data: args.header,
          previousData: old,
        })
      ).data;
    } else
      parent = (
        await provider.create("romiku_production_orders", {
          data: {
            order_id: args.source_order_id,
            document_number: "SO-001-P01",
            supplier_id: null,
            supplier_snapshot: null,
            ...args.header,
          },
        })
      ).data;
    for (const line of args.items) {
      if (line.id != null) {
        const old = (
          await provider.getOne("romiku_production_items", { id: line.id })
        ).data;
        await provider.update("romiku_production_items", {
          id: line.id,
          data: line,
          previousData: old,
        });
      } else {
        const source = (
          await provider.getOne("romiku_order_items", {
            id: line.source_order_item_id,
          })
        ).data;
        const { id: _id, ...rest } = line;
        await provider.create("romiku_production_items", {
          data: {
            ...rest,
            order_id: args.source_order_id,
            production_order_id: parent.id,
            sku: source.sku,
          },
        });
      }
    }
    return { data: { ok: true, id: parent.id }, error: null };
  });
  const screen = await render(
    <MemoryRouter initialEntries={[path]}>
      <CoreAdminContext dataProvider={provider}>
        <Routes>{romikuRoutes}</Routes>
      </CoreAdminContext>
    </MemoryRouter>,
  );
  return { provider, screen };
}
it("creates selected production items in one supplier-free Production through the ROMIKU route", async () => {
  const { screen, provider } = await setup("/production/new?order=o");
  await screen.getByLabelText("选择 A", { exact: true }).click();
  await screen.getByLabelText("选择 B", { exact: true }).click();
  await expect.element(screen.getByText("选择", { exact: true })).toBeVisible();
  await expect
    .element(screen.getByText("订单数量", { exact: true }))
    .toBeVisible();
  await expect.element(screen.getByText("箱数", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("4", { exact: true })).toBeVisible();
  await expect
    .element(screen.getByText("本次生产数量", { exact: true }))
    .toBeVisible();
  await screen
    .getByRole("button", { name: "下一步：编辑整张生产单", exact: true })
    .click();
  expect(
    await readRelated(provider, "romiku_production_orders", {}),
  ).toHaveLength(0);
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  await expect
    .element(screen.getByRole("button", { name: "编辑", exact: true }))
    .toBeVisible();
  const rows = await readRelated(provider, "romiku_production_orders", {});
  expect(rows).toHaveLength(1);
  expect(rows[0].supplier_id).toBeNull();
  expect(rows[0].supplier_snapshot).toBeNull();
  expect(
    (await readRelated(provider, "romiku_order_items", {}))[0].quantity,
  ).toBe(100);
});
it("shows ordered, packed and remaining quantities and blocks packing over the remaining amount", async () => {
  const { screen, provider } = await setup("/packing-shipping/p");
  await expect
    .element(screen.getByRole("button", { name: "导出 Packing XLSX" }))
    .toBeVisible();
  expect(screen.getByText("Packing PDF", { exact: false }).query()).toBeNull();
  await screen.getByLabelText("cartons A", { exact: true }).fill("2");
  await screen.getByLabelText("qty_per_carton A", { exact: true }).fill("10");
  await screen.getByLabelText("length_cm A", { exact: true }).fill("50");
  await screen.getByLabelText("width_cm A", { exact: true }).fill("40");
  await screen.getByLabelText("height_cm A", { exact: true }).fill("30");
  await screen.getByLabelText("carton_weight_kg A", { exact: true }).fill("8");
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  await expect
    .element(screen.getByText("0.120 m³", { exact: true }).first())
    .toBeVisible();
  expect(await readRelated(provider, "romiku_packing_items", {})).toHaveLength(
    1,
  );
});
it("replaces zero-valued Packing dimensions with decimal input instead of appending", async () => {
  const { screen, provider } = await setup("/packing-shipping/p");
  await screen.getByLabelText("cartons A", { exact: true }).fill("2");
  await screen.getByLabelText("qty_per_carton A", { exact: true }).fill("10");
  const length = screen.getByLabelText("length_cm A", { exact: true });
  await length.click();
  await userEvent.type(length, "55");
  await expect.element(length).toHaveValue(55);

  const width = screen.getByLabelText("width_cm A", { exact: true });
  await width.click();
  await userEvent.type(width, "0.08");
  await expect.element(width).toHaveValue(0.08);

  const height = screen.getByLabelText("height_cm A", { exact: true });
  await height.fill("50");
  await userEvent.clear(height);
  await userEvent.type(height, "55");
  await expect.element(height).toHaveValue(55);
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await provider.getOne("romiku_packing_items", { id: "packed-i" }))
          .data,
    )
    .toMatchObject({ length_cm: 55, width_cm: 0.08, height_cm: 55 });
});
it("stages a Packing row removal until Save and restores it on Cancel", async () => {
  const { screen, provider } = await setup("/packing-shipping/p");
  await screen.getByRole("button", { name: "更多操作 A", exact: true }).click();
  await screen
    .getByRole("button", { name: "从此装箱单删除", exact: true })
    .click();
  await screen.getByRole("button", { name: "确认移除", exact: true }).click();
  expect(
    screen.getByLabelText("quantity A", { exact: true }).query(),
  ).toBeNull();
  await screen.getByRole("button", { name: "取消", exact: true }).click();
  await expect
    .element(screen.getByLabelText("quantity A", { exact: true }))
    .toBeVisible();

  await screen.getByRole("button", { name: "更多操作 A", exact: true }).click();
  await screen
    .getByRole("button", { name: "从此装箱单删除", exact: true })
    .click();
  await screen.getByRole("button", { name: "确认移除", exact: true }).click();
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  await expect
    .poll(async () => readRelated(provider, "romiku_packing_items", {}))
    .toHaveLength(0);
  expect(
    (await provider.getOne("romiku_order_items", { id: "i" })).data,
  ).toMatchObject({
    quantity: 100,
  });
});
it("creates an Order Packing List with every remaining Order item and edits only its saved copy", async () => {
  const { screen, provider } = await setup("/packing-shipping/new?order=o");
  await screen.getByRole("button", { name: "创建装箱单", exact: true }).click();
  await expect
    .element(screen.getByLabelText("cartons A", { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByLabelText("cartons B", { exact: true }))
    .toBeVisible();
  expect(
    screen.getByLabelText("从订单加入产品", { exact: true }).query(),
  ).toBeNull();
  const packing = (
    await readRelated(provider, "romiku_packing_lists", {})
  ).find((item) => item.id !== "p");
  expect(packing).toBeDefined();
  await screen.getByLabelText("unit A", { exact: true }).fill("SET");
  const imported = (
    await readRelated(provider, "romiku_packing_items", {})
  ).filter((item) => item.packing_list_id === packing?.id);
  expect(imported).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sku: "A", quantity: 60 }),
      expect.objectContaining({ sku: "B", quantity: 200 }),
    ]),
  );
  await screen.getByLabelText("cartons A", { exact: true }).fill("1");
  await screen.getByLabelText("qty_per_carton A", { exact: true }).fill("15");
  await screen.getByLabelText("cartons B", { exact: true }).fill("1");
  await screen.getByLabelText("qty_per_carton B", { exact: true }).fill("200");
  await expect
    .element(screen.getByLabelText("quantity A", { exact: true }))
    .toHaveValue("15");
  await expect
    .element(screen.getByLabelText("quantity B", { exact: true }))
    .toHaveValue("200");
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await readRelated(provider, "romiku_packing_items", {})).find(
          (item) => item.packing_list_id === packing?.id && item.sku === "A",
        )?.quantity,
    )
    .toBe(15);
  const line = (await readRelated(provider, "romiku_packing_items", {})).find(
    (item) => item.packing_list_id === packing?.id && item.sku === "A",
  );
  expect(line).toBeDefined();
  expect(line?.product_snapshot).toEqual({ name: "Lamp", unit: "SET" });
  expect(
    (await provider.getOne("romiku_order_items", { id: "i" })).data
      .product_snapshot,
  ).toEqual({ name: "Lamp", unit: "PCS" });
  expect(packing).toMatchObject({
    packing_at: expect.any(String),
    seller_snapshot: {
      company_name: "YIWU ROMIKU NAIL SUPPLY 义乌络洣库美甲",
    },
    buyer_snapshot: {
      company: "Saved Order Buyer",
      address: "Madrid",
    },
  });
  expect(
    await readRelated(provider, "romiku_packing_lists", { order_id: "o" }),
  ).toHaveLength(2);
});
it("creates an independent Packing List with saved date and empty Buyer", async () => {
  const { screen, provider } = await setup("/packing-shipping/new");
  await screen.getByLabelText("直接创建 / 不关联订单", { exact: true }).click();
  await screen.getByRole("button", { name: "创建装箱单", exact: true }).click();
  await expect
    .element(screen.getByText("独立装箱单：未关联订单。", { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText("从产品库添加产品", { exact: true }))
    .toBeVisible();

  const packing = (
    await readRelated(provider, "romiku_packing_lists", {})
  ).find((item) => item.id !== "p");
  expect(packing).toMatchObject({
    order_id: null,
    packing_at: expect.any(String),
    seller_snapshot: {
      company_name: "YIWU ROMIKU NAIL SUPPLY 义乌络洣库美甲",
    },
    buyer_snapshot: {},
  });
});
it("edits a Production Order copy while retaining its Order source", async () => {
  const { screen, provider } = await setup("/production/new?order=o");
  await screen.getByLabelText("选择 A", { exact: true }).click();
  await screen
    .getByRole("button", { name: "下一步：编辑整张生产单", exact: true })
    .click();
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await expect.element(screen.getByText("SKU", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("产品", { exact: true })).toBeVisible();
  await expect
    .element(screen.getByText("图片", { exact: true }).last())
    .toBeVisible();
  await expect
    .element(screen.getByText("装箱数", { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText("总数量", { exact: true }))
    .toBeVisible();
  expect(
    screen.getByLabelText("订单产品项", { exact: true }).query(),
  ).toBeNull();
  await screen
    .getByLabelText("产品名称 A", { exact: true })
    .fill("Factory copy");
  await screen.getByLabelText("总数量 A", { exact: true }).fill("30");
  await screen.getByLabelText("箱数 A", { exact: true }).fill("5");
  await screen.getByLabelText("装箱数 A", { exact: true }).fill("32");
  await screen
    .getByLabelText("产品规格 A", { exact: true })
    .fill("Saved factory specification");
  await expect
    .element(
      screen.getByText("总数量与箱数 × 装箱数不一致；仍可按本次生产数量保存。"),
    )
    .toBeVisible();
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await readRelated(provider, "romiku_production_items", {}))[0]
          .quantity,
    )
    .toBe(30);
  expect(
    (await readRelated(provider, "romiku_production_items", {}))[0],
  ).toMatchObject({
    packaging_snapshot: { cartons: 5, qty_per_carton: 32 },
    product_snapshot: { specification: "Saved factory specification" },
  });
  expect(
    (await provider.getOne("romiku_order_items", { id: "i" })).data
      .product_snapshot,
  ).toEqual({ name: "Lamp", unit: "PCS" });
  expect(
    (await readRelated(provider, "romiku_production_orders", {}))[0]
      .supplier_id,
  ).toBeNull();
});

it("saves a manual Production Order number without changing its source Order", async () => {
  const { screen, provider } = await setup("/production/new?order=o");
  await screen.getByLabelText("选择 A", { exact: true }).click();
  await screen
    .getByRole("button", { name: "下一步：编辑整张生产单", exact: true })
    .click();
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await screen.getByText("生产单详情", { exact: true }).click();
  await screen
    .getByLabelText("单据编号", { exact: true })
    .fill("RCI260920001-P01");
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await readRelated(provider, "romiku_production_orders", {}))[0]
          .document_number,
    )
    .toBe("RCI260920001-P01");
  expect(
    (await provider.getOne("romiku_orders", { id: "o" })).data.document_number,
  ).toBe("SO-001");
});
