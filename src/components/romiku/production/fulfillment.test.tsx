import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter, Routes } from "react-router";
import { page } from "vitest/browser";
import { romikuRoutes } from "../routes/RomikuRoutes";
import { readRelated } from "../outbound/workflow";
import "@/index.css";
async function setup(path: string) {
  await page.viewport(1440, 1200);
  const provider = fakeRestDataProvider({
    romiku_orders: [{ id: "o", document_number: "SO-001" }],
    romiku_order_items: [
      {
        id: "i",
        order_id: "o",
        sku: "A",
        quantity: 100,
        product_snapshot: { name: "Lamp" },
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
    romiku_packing_items: [],
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
    .element(screen.getByText("生产数量", { exact: true }))
    .toBeVisible();
  await screen.getByRole("button", { name: "创建生产单", exact: true }).click();
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("已创建 1 张生产单");
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
  await screen
    .getByLabelText("从订单加入产品", { exact: true })
    .selectOptions("i");
  await screen.getByRole("button", { name: "加入", exact: true }).click();
  await screen.getByLabelText("quantity A", { exact: true }).fill("20");
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
it("creates multiple Packing Lists for the same Order and edits only the copied line", async () => {
  const { screen, provider } = await setup("/packing-shipping/new?order=o");
  await screen.getByRole("button", { name: "创建装箱单", exact: true }).click();
  await screen
    .getByLabelText("从订单加入产品", { exact: true })
    .selectOptions("i");
  await screen.getByRole("button", { name: "加入", exact: true }).click();
  await screen.getByLabelText("quantity A", { exact: true }).fill("15");
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await readRelated(provider, "romiku_packing_items", {}))[0].quantity,
    )
    .toBe(15);
  const line = (await readRelated(provider, "romiku_packing_items", {}))[0];
  expect(line.product_snapshot).toEqual({ name: "Lamp" });
  expect(
    (await provider.getOne("romiku_order_items", { id: "i" })).data
      .product_snapshot,
  ).toEqual({ name: "Lamp" });
  expect(
    await readRelated(provider, "romiku_packing_lists", { order_id: "o" }),
  ).toHaveLength(2);
});
it("edits a Production Order copy while retaining its Order source", async () => {
  const { screen, provider } = await setup("/production/new?order=o");
  await screen.getByLabelText("选择 A", { exact: true }).click();
  await screen.getByRole("button", { name: "创建生产单", exact: true }).click();
  await screen.getByRole("link").nth(1).click();
  await screen.getByRole("button", { name: "编辑生产产品项" }).click();
  await expect
    .element(screen.getByLabelText("订单产品项", { exact: true }))
    .toBeDisabled();
  await screen.getByLabelText("产品名称", { exact: true }).fill("Factory copy");
  await screen.getByLabelText("数量", { exact: true }).fill("30");
  await screen
    .getByRole("button", { name: "保存生产产品项", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await readRelated(provider, "romiku_production_items", {}))[0]
          .quantity,
    )
    .toBe(30);
  expect(
    (await provider.getOne("romiku_order_items", { id: "i" })).data
      .product_snapshot,
  ).toEqual({ name: "Lamp" });
  expect(
    (await readRelated(provider, "romiku_production_orders", {}))[0]
      .supplier_id,
  ).toBeNull();
});

it("saves a manual Production Order number without changing its source Order", async () => {
  const { screen, provider } = await setup("/production/new?order=o");
  await screen.getByLabelText("选择 A", { exact: true }).click();
  await screen.getByRole("button", { name: "创建生产单", exact: true }).click();
  await screen.getByRole("link").nth(1).click();
  await screen.getByText("生产单详情", { exact: true }).click();
  await screen
    .getByLabelText("单据编号", { exact: true })
    .fill("RCI260920001-P01");
  await screen.getByRole("button", { name: "保存生产单", exact: true }).click();
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
