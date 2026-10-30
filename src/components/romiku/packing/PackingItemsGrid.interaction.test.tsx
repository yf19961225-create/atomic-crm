import { afterEach, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { useState } from "react";
import { render } from "vitest-browser-react";
import { CoreAdminContext, type RaRecord } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { hasAppDraft } from "../updates/drafts";
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
  expect(hasAppDraft()).toBe(false);
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
  expect(hasAppDraft()).toBe(true);
  expect(
    (await provider.getOne("romiku_packing_items", { id: "line" })).data
      .quantity,
  ).toBe(1);
  await screen.getByRole("button", { name: "取消", exact: true }).click();
  await expect.element(screen.getByLabelText("cartons SUN5")).toHaveValue(1);
  expect(hasAppDraft()).toBe(false);
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

it("linked packing searches only imported rows and focuses their editable field", async () => {
  const { screen, provider } = await fixture();
  await screen.getByLabelText("搜索本单产品").fill("SUN");
  await expect
    .element(screen.getByRole("button", { name: /SUN5 · Historical lamp/ }))
    .toBeVisible();
  await screen.getByRole("button", { name: /SUN5 · Historical lamp/ }).click();
  expect(document.activeElement).toBe(
    screen.getByLabelText("cartons SUN5").element(),
  );
  expect(document.querySelectorAll("tbody tr")).toHaveLength(1);
  const records = await provider.getList("romiku_packing_items", {
    filter: {},
    pagination: { page: 1, perPage: 25 },
    sort: { field: "id", order: "ASC" },
  });
  expect(records.data).toHaveLength(1);
});

it("linked packing Enter on the final row does not add an unrelated product", async () => {
  const { screen } = await fixture();
  const field = screen.getByLabelText("cartons SUN5").element();
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
  });
  field.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(document.querySelectorAll("tbody tr")).toHaveLength(1);
  expect(
    document.querySelector('input[aria-label="搜索 SKU 或产品"]'),
  ).toBeNull();
});

it("standalone packing Enter returns to catalog input without creating blank business rows", async () => {
  const screen = await render(
    <CoreAdminContext dataProvider={fakeRestDataProvider({})}>
      <PackingItemsGrid
        parent={{ id: "standalone" }}
        items={[
          {
            id: "local",
            sku: "NA255",
            quantity: 1,
            cartons: 1,
            qty_per_carton: 1,
          },
        ]}
        onSaved={async () => {}}
      />
    </CoreAdminContext>,
  );
  const field = screen.getByLabelText("cartons NA255").element();
  field.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }),
  );
  expect(document.activeElement).toBe(
    screen.getByLabelText("搜索 SKU 或产品").element(),
  );
  expect(document.querySelectorAll("tbody tr")).toHaveLength(1);
});

it("linked packing advances to next imported row and ignores repeat or IME", async () => {
  const screen = await render(
    <CoreAdminContext dataProvider={fakeRestDataProvider({})}>
      <PackingItemsGrid
        parent={{ id: "linked", order_id: "order" }}
        items={["A", "B"].map((sku) => ({
          id: sku,
          sku,
          quantity: 1,
          cartons: 1,
          qty_per_carton: 1,
        }))}
        onSaved={async () => {}}
      />
    </CoreAdminContext>,
  );
  const first = screen.getByLabelText("cartons A");
  await first.click();
  first.element().dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      repeat: true,
    }),
  );
  expect(document.activeElement).toBe(first.element());
  first.element().dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      isComposing: true,
    }),
  );
  expect(document.activeElement).toBe(first.element());
  first
    .element()
    .dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  expect(document.activeElement).toBe(
    screen.getByLabelText("cartons B").element(),
  );
  expect(document.querySelectorAll("tbody tr")).toHaveLength(2);
});

it("standalone selects two products entirely by keyboard through the next-row focus path", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return new Response(
        JSON.stringify(
          url.startsWith("/api/product-catalog")
            ? {
                result: ["AAA", "BBB"].map((sku) => ({
                  _id: sku,
                  sku,
                  isPublished: true,
                  name: { zh: sku },
                })),
              }
            : url.startsWith("/api/product-images")
              ? { images: {}, powerSupplies: {} }
              : [],
        ),
        { headers: { "Content-Type": "application/json" } },
      );
    }),
  );
  const screen = await render(
    <CoreAdminContext dataProvider={fakeRestDataProvider({})}>
      <PackingItemsGrid
        parent={{ id: "standalone" }}
        items={[]}
        onSaved={async () => {}}
      />
    </CoreAdminContext>,
  );
  const search = screen.getByLabelText("搜索 SKU 或产品");
  await search.fill("AAA");
  await expect
    .element(screen.getByRole("button", { name: /AAA · AAA/ }))
    .toBeVisible();
  await userEvent.keyboard("{Enter}");
  await expect.element(screen.getByLabelText("cartons AAA")).toHaveFocus();
  await userEvent.keyboard("2{Enter}");
  await expect.element(search).toHaveFocus();
  const input = search.element() as HTMLInputElement;
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(input.value.length);
  await userEvent.keyboard("BBB");
  await expect
    .element(screen.getByRole("button", { name: /BBB · BBB/ }))
    .toBeVisible();
  await userEvent.keyboard("{ArrowDown}{Enter}");
  await expect.element(screen.getByLabelText("cartons BBB")).toHaveFocus();
  await expect.element(screen.getByLabelText("cartons AAA")).toHaveValue(2);
});
afterEach(() => vi.unstubAllGlobals());
