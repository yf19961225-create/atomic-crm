import { expect, it } from "vitest";
import { useState } from "react";
import { render } from "vitest-browser-react";
import { CoreAdminContext, type RaRecord } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { PackingItemsGrid } from "./PackingItemsGrid";

async function fixture(overrides: Record<string, unknown> = {}) {
  const row = {
    id: "line",
    packing_list_id: "packing",
    order_id: "order",
    source_order_item_id: "source",
    position: 1,
    sku: "SUN5",
    quantity: 1,
    cartons: 1,
    qty_per_carton: 1,
    length_cm: 0,
    width_cm: 0,
    height_cm: 0,
    carton_weight_kg: 0,
    ...overrides,
    product_snapshot: {
      name: "Historical lamp",
      specification: "Saved UV specification",
      unit: "PCS",
    },
  };
  const provider = fakeRestDataProvider({
    romiku_packing_items: [row],
    romiku_order_items: [
      {
        id: "source",
        order_id: "order",
        sku: "SUN5",
        quantity: 1000,
        product_snapshot: { name: "Current library name" },
      },
    ],
    romiku_order_item_remaining: [{ id: "source", remaining_quantity: 999 }],
  });
  function Fixture() {
    const [items, setItems] = useState<RaRecord[]>([row]);
    return (
      <CoreAdminContext dataProvider={provider}>
        <PackingItemsGrid
          parent={{ id: "packing", order_id: "order" }}
          items={items}
          onSaved={async () => {
            setItems(
              (
                await provider.getList("romiku_packing_items", {
                  filter: {},
                  pagination: { page: 1, perPage: 25 },
                  sort: { field: "position", order: "ASC" },
                })
              ).data,
            );
          }}
        />
      </CoreAdminContext>
    );
  }
  return { screen: await render(<Fixture />), provider };
}
it("renders all 16 template columns with specification and Unit in separate cells", async () => {
  const { screen } = await fixture();
  expect(
    Array.from(document.querySelectorAll("thead th")).map((x) => x.textContent),
  ).toEqual([
    "No.",
    "货号",
    "产品名称",
    "图片",
    "产品规格",
    "箱数",
    "Qty/Ctn",
    "Unit",
    "总数量",
    "长(cm)",
    "宽(cm)",
    "高(cm)",
    "CBM",
    "Weight",
    "Total CBM",
    "Total Weight",
    "操作",
  ]);
  await expect
    .element(
      screen.getByRole("cell", { name: "Saved UV specification", exact: true }),
    )
    .toBeVisible();
  expect(
    document.querySelector('input[aria-label="unit SUN5"]')?.closest("td")
      ?.cellIndex,
  ).toBe(7);
});
it("recalculates all totals immediately and persists the calculated quantity after reload", async () => {
  const { screen, provider } = await fixture();
  await screen.getByLabelText("cartons SUN5").fill("5");
  await expect.element(screen.getByLabelText("quantity SUN5")).toHaveValue("5");
  await screen.getByLabelText("qty_per_carton SUN5").fill("32");
  await expect
    .element(screen.getByLabelText("quantity SUN5"))
    .toHaveValue("160");
  await screen.getByLabelText("length_cm SUN5").fill("50");
  await screen.getByLabelText("width_cm SUN5").fill("50");
  await screen.getByLabelText("height_cm SUN5").fill("50");
  await screen.getByLabelText("carton_weight_kg SUN5").fill("55");
  await screen.getByLabelText("unit SUN5").fill("SETS");
  await expect
    .element(screen.getByLabelText("carton_cbm SUN5"))
    .toHaveValue("0.125");
  await expect
    .element(screen.getByLabelText("total_cbm SUN5"))
    .toHaveValue("0.625");
  await expect
    .element(screen.getByLabelText("total_weight_kg SUN5"))
    .toHaveValue("275.00");
  for (const label of [
    "quantity",
    "carton_cbm",
    "total_cbm",
    "total_weight_kg",
  ]) {
    expect(
      document.querySelector<HTMLInputElement>(
        `input[aria-label="${label} SUN5"]`,
      )?.readOnly,
    ).toBe(true);
  }
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  await expect
    .element(screen.getByRole("button", { name: "保存", exact: true }))
    .toBeDisabled();
  expect(
    (await provider.getOne("romiku_packing_items", { id: "line" })).data,
  ).toMatchObject({
    quantity: 160,
    cartons: 5,
    qty_per_carton: 32,
    length_cm: 50,
    width_cm: 50,
    height_cm: 50,
    carton_weight_kg: 55,
    product_snapshot: {
      name: "Historical lamp",
      specification: "Saved UV specification",
      unit: "SETS",
    },
  });
  await expect
    .element(screen.getByLabelText("quantity SUN5"))
    .toHaveValue("160");
  await screen.getByLabelText("cartons SUN5").fill("6");
  await expect
    .element(screen.getByLabelText("quantity SUN5"))
    .toHaveValue("192");
  await expect
    .element(screen.getByLabelText("total_cbm SUN5"))
    .toHaveValue("0.750");
  await expect
    .element(screen.getByLabelText("total_weight_kg SUN5"))
    .toHaveValue("330.00");
  await screen.getByRole("button", { name: "取消", exact: true }).click();
  await expect
    .element(screen.getByLabelText("quantity SUN5"))
    .toHaveValue("160");
});
it("keeps row deletion staged until Save and restores it with Cancel", async () => {
  const { screen, provider } = await fixture();
  await screen.getByRole("button", { name: "更多操作 SUN5" }).click();
  await screen.getByRole("button", { name: "从此装箱单删除" }).click();
  await screen.getByRole("button", { name: "确认移除" }).click();
  expect(
    (await provider.getOne("romiku_packing_items", { id: "line" })).data
      .quantity,
  ).toBe(1);
  await screen.getByRole("button", { name: "取消", exact: true }).click();
  await expect.element(screen.getByLabelText("cartons SUN5")).toHaveValue(1);
});

it("lets the user save a legacy row whose stored quantity differs from its carton plan", async () => {
  const { screen, provider } = await fixture({
    quantity: 1,
    cartons: 5,
    qty_per_carton: 32,
  });
  await expect
    .element(screen.getByLabelText("quantity SUN5"))
    .toHaveValue("160");
  await expect
    .element(screen.getByRole("button", { name: "保存", exact: true }))
    .toBeEnabled();
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  await expect
    .element(screen.getByRole("button", { name: "保存", exact: true }))
    .toBeDisabled();
  expect(
    (await provider.getOne("romiku_packing_items", { id: "line" })).data
      .quantity,
  ).toBe(160);
});
