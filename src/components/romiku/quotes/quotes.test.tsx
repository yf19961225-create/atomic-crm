import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter, Routes } from "react-router";
import { page, userEvent } from "vitest/browser";
import { romikuRoutes } from "../routes/RomikuRoutes";
import "@/index.css";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc }),
}));
const list = {
  pagination: { page: 1, perPage: 100 },
  sort: { field: "id", order: "ASC" as const },
  filter: {},
};
const defaultQuoteItems = [
  {
    id: "qi",
    quote_id: "q",
    source_website_inquiry_item_id: "i1",
    sku: "A",
    quantity: 100,
    unit_price: 2,
    product_snapshot: { name: "Original snapshot" },
    packing_snapshot: { qty_per_carton: 12 },
  },
];
const setup = async (
  path: string,
  options: {
    quote?: Record<string, unknown>;
    items?: Record<string, unknown>[];
    inquiryItems?: Record<string, unknown>[];
  } = {},
) => {
  await page.viewport(1440, 1000);
  rpc.mockReset().mockResolvedValue({ data: "q", error: null });
  const provider = fakeRestDataProvider({
    romiku_quotes: [
      {
        id: "q",
        document_number: "Q-001",
        status: "pending_quote",
        currency: "USD",
        counterparty_snapshot: { name: "Ana" },
        source_website_inquiry_id: "in",
        freight: 20,
        other_expenses: 15,
        discount: 10,
        terms_snapshot: {},
        ...options.quote,
      },
    ],
    romiku_quote_totals: [],
    romiku_quote_items: options.items ?? defaultQuoteItems,
    romiku_website_inquiries: [
      {
        id: "in",
        document_number: "WI-1",
        customer_name: "Ana",
        email: "ana@example.test",
        status: "new",
        raw_payload: { original: true },
      },
    ],
    romiku_website_inquiry_items: options.inquiryItems ?? [
      {
        id: "i1",
        inquiry_id: "in",
        sku: "A",
        quantity: 100,
        requirement: "White",
      },
      { id: "i2", inquiry_id: "in", sku: "B", quantity: 20 },
    ],
    romiku_website_inquiry_followups: [],
    romiku_formal_customers: [],
    romiku_formal_customer_directory: [],
    romiku_outbound_companies: [],
    sales: [],
  });
  const screen = await render(
    <MemoryRouter initialEntries={[path]}>
      <CoreAdminContext dataProvider={provider}>
        <Routes>{romikuRoutes}</Routes>
      </CoreAdminContext>
    </MemoryRouter>,
  );
  return { screen, provider };
};

it("opens inquiry selection without creating a Quote, then confirms only the selected originals", async () => {
  const { screen } = await setup("/website-inquiries?record=in");
  await screen.getByRole("link", { name: "创建报价单" }).click();
  await expect
    .element(screen.getByRole("heading", { name: "确认询盘产品项" }))
    .toBeVisible();
  expect(rpc).not.toHaveBeenCalled();
  await screen.getByLabelText("包含 B").click();
  await screen.getByRole("button", { name: "确认并创建报价单" }).click();
  await expect
    .element(screen.getByRole("heading", { name: "Q-001" }))
    .toBeVisible();
  expect(rpc).toHaveBeenCalledWith("romiku_quote_from_inquiry", {
    inquiry_id: "in",
    selected_item_ids: ["i1"],
  });
});

it("edits and removes Quote snapshots while leaving inquiry and customer archives untouched", async () => {
  const { screen, provider } = await setup("/quotes/q");
  const original = (
    await provider.getList("romiku_website_inquiry_items", list)
  ).data;
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await screen.getByRole("tab", { name: "产品项", exact: true }).click();
  expect(
    (await provider.getOne("romiku_quote_items", { id: "qi" })).data.quantity,
  ).toBe(100);
  await screen.getByText("⋯", { exact: true }).click();
  await screen.getByRole("button", { name: "更多详情", exact: true }).click();
  await screen.getByLabelText("产品名称", { exact: true }).fill("Quoted name");
  await screen.getByLabelText("规格", { exact: true }).fill("Blue finish");
  await screen.getByLabelText("包装", { exact: true }).fill("Carton");
  await screen.getByRole("button", { name: "保存详情", exact: true }).click();
  await screen.getByRole("tab", { name: "条款与费用" }).click();
  await screen
    .getByRole("spinbutton", { name: "其他费用", exact: true })
    .fill("25");
  await screen.getByLabelText("付款条款", { exact: true }).fill("50% deposit");
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  expect(
    (await provider.getOne("romiku_quote_items", { id: "qi" })).data,
  ).toMatchObject({
    source_website_inquiry_item_id: "i1",
    product_snapshot: {
      name: "Quoted name",
      specification: "Blue finish",
    },
    packing_snapshot: { description: "Carton" },
  });
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await screen.getByRole("tab", { name: "产品项", exact: true }).click();
  await screen.getByText("⋯", { exact: true }).click();
  await screen.getByRole("button", { name: "删除行", exact: true }).click();
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await provider.getList("romiku_quote_items", list)).data.length,
    )
    .toBe(0);
  expect(
    (await provider.getList("romiku_website_inquiry_items", list)).data,
  ).toEqual(original);
  expect(
    (await provider.getList("romiku_formal_customers", list)).data,
  ).toEqual([]);
});

it("uses the fixed eight Quote columns and saves a manual CBM only on the Quote item", async () => {
  const { screen, provider } = await setup("/quotes/q");
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await screen.getByRole("tab", { name: "产品项", exact: true }).click();
  for (const header of [
    "No.",
    "货号",
    "产品名称",
    "图片",
    "产品规格",
    "装箱数",
    "单价",
    "CBM",
  ])
    await expect
      .element(screen.getByText(header, { exact: true }))
      .toBeVisible();
  expect(screen.getByText("总数量", { exact: true }).all()).toHaveLength(0);
  expect(screen.getByText("总金额", { exact: true }).all()).toHaveLength(0);
  const qtyPerCarton = screen.getByLabelText("Qty/Ctn", { exact: true });
  await expect.element(qtyPerCarton).toHaveAttribute("min", "1");
  await expect.element(qtyPerCarton).toHaveAttribute("step", "1");
  await screen.getByLabelText("CBM", { exact: true }).fill("0.072");
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  expect(
    (await provider.getOne("romiku_quote_items", { id: "qi" })).data
      .packing_snapshot,
  ).toMatchObject({ qty_per_carton: 12, carton_cbm: 0.072 });
});

it("retains decimal Quote CBM values after blur, save, and refresh", async () => {
  const { screen, provider } = await setup("/quotes/q");
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await screen.getByRole("tab", { name: "产品项", exact: true }).click();
  const cbm = screen.getByLabelText("CBM", { exact: true });
  await cbm.click();
  await userEvent.clear(cbm);
  await userEvent.type(cbm, "0.08");
  await screen.getByText("CBM", { exact: true }).click();
  await expect.element(cbm).toHaveValue(0.08);
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  expect(
    (await provider.getOne("romiku_quote_items", { id: "qi" })).data
      .packing_snapshot,
  ).toMatchObject({ carton_cbm: 0.08 });

  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await screen.getByRole("tab", { name: "产品项", exact: true }).click();
  const refreshedCbm = screen.getByLabelText("CBM", { exact: true });
  await expect.element(refreshedCbm).toHaveValue(0.08);
  await refreshedCbm.click();
  await userEvent.clear(refreshedCbm);
  await userEvent.type(refreshedCbm, "0.125");
  await screen.getByText("CBM", { exact: true }).click();
  await expect.element(refreshedCbm).toHaveValue(0.125);
  await refreshedCbm.fill("-0.08");
  await screen.getByText("CBM", { exact: true }).click();
  await expect.element(refreshedCbm).toHaveValue(0.125);
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  expect(
    (await provider.getOne("romiku_quote_items", { id: "qi" })).data
      .packing_snapshot,
  ).toMatchObject({ carton_cbm: 0.125 });
});

it("recalculates every populated Quote CNY price when its USD rate changes", async () => {
  const { screen } = await setup("/quotes/q", {
    items: [
      { ...defaultQuoteItems[0], source_cny_unit_price: 67.7 },
      {
        ...defaultQuoteItems[0],
        id: "qj",
        sku: "B",
        source_cny_unit_price: 5,
      },
      {
        ...defaultQuoteItems[0],
        id: "qk",
        sku: "C",
        source_cny_unit_price: 18,
      },
    ],
  });
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await screen.getByLabelText("启用汇率换算", { exact: true }).click();
  const rate = screen.getByLabelText("USD 汇率", { exact: true });
  await rate.click();
  await userEvent.clear(rate);
  await userEvent.type(rate, "6.7700");
  const usdPrices = screen.getByLabelText("单价(USD)", { exact: true }).all();
  await expect.element(usdPrices[0]).toHaveValue("10.0000");
  await expect.element(usdPrices[1]).toHaveValue("0.7386");
  await expect.element(usdPrices[2]).toHaveValue("2.6588");
  await screen.getByLabelText("USD 汇率", { exact: true }).fill("6.80");
  const repricedUsd = screen.getByLabelText("单价(USD)", { exact: true }).all();
  await expect.element(repricedUsd[0]).toHaveValue("9.9559");
  await expect.element(repricedUsd[1]).toHaveValue("0.7353");
  await expect.element(repricedUsd[2]).toHaveValue("2.6471");
});

it("retains a Quote CNY source price entered before the FX rate", async () => {
  const { screen } = await setup("/quotes/q");
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await screen.getByLabelText("启用汇率换算", { exact: true }).click();
  await screen.getByLabelText("人民币单价", { exact: true }).fill("5.00");
  await screen.getByLabelText("USD 汇率", { exact: true }).fill("6.77");
  await expect
    .element(screen.getByLabelText("单价(USD)", { exact: true }))
    .toHaveValue("0.7386");
});

it("retains all six allowed FX rate decimals after blur", async () => {
  const { screen } = await setup("/quotes/q");
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await screen.getByLabelText("启用汇率换算", { exact: true }).click();
  const rate = screen.getByLabelText("USD 汇率", { exact: true });
  await rate.fill("7.024512");
  await screen.getByText("1 USD = X CNY", { exact: true }).click();
  await expect.element(rate).toHaveValue(7.024512);
});

it("persists Quote FX pricing and restores direct USD edits only after FX is disabled", async () => {
  const { screen, provider } = await setup("/quotes/q");
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await screen.getByLabelText("启用汇率换算", { exact: true }).click();
  await screen.getByLabelText("USD 汇率", { exact: true }).fill("6.77");
  await screen.getByLabelText("人民币单价", { exact: true }).fill("5.00");
  await expect
    .element(screen.getByLabelText("单价(USD)", { exact: true }))
    .toHaveValue("0.7386");
  await screen.getByLabelText("启用汇率换算", { exact: true }).click();
  const directUsdPrice = screen.getByLabelText("单价", { exact: true });
  await expect.element(directUsdPrice).toHaveValue(0.7386);
  await directUsdPrice.fill("0.8000");
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  expect(
    (await provider.getOne("romiku_quotes", { id: "q" })).data,
  ).toMatchObject({
    fx_enabled: false,
    usd_cny_rate: 6.77,
  });
  expect(
    (await provider.getOne("romiku_quote_items", { id: "qi" })).data,
  ).toMatchObject({ source_cny_unit_price: 5, unit_price: 0.8 });
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await expect
    .element(screen.getByLabelText("单价", { exact: true }))
    .toHaveValue(0.8);
  await screen.getByLabelText("启用汇率换算", { exact: true }).click();
  await expect
    .element(screen.getByLabelText("单价(USD)", { exact: true }))
    .toHaveValue("0.7386");
});

it("hides Quote FX controls when the Quote currency is CNY", async () => {
  const { screen } = await setup("/quotes/q", {
    quote: { currency: "CNY", fx_enabled: true, usd_cny_rate: 6.77 },
  });
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  expect(
    screen.getByLabelText("启用汇率换算", { exact: true }).all(),
  ).toHaveLength(0);
  await expect
    .element(screen.getByLabelText("单价", { exact: true }))
    .toBeVisible();
});

it("edits a Quote-only Seller snapshot and disables XLSX export while there are unsaved edits", async () => {
  const { screen, provider } = await setup("/quotes/q");
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await expect
    .element(screen.getByRole("button", { name: "导出 XLSX" }))
    .toBeDisabled();
  await screen
    .getByRole("button", { name: "导出信息 / Document Details" })
    .click();
  await screen
    .getByLabelText("Seller company_name", { exact: true })
    .fill("Saved Quote Seller");
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  expect(
    (await provider.getOne("romiku_quotes", { id: "q" })).data.terms_snapshot,
  ).toMatchObject({
    quote_export: { seller: { company_name: "Saved Quote Seller" } },
  });
});

it("creates a direct Quote and supports adding its own items", async () => {
  const { screen, provider } = await setup("/quotes");
  await screen.getByRole("link", { name: "新建报价单" }).click();
  await screen
    .getByLabelText("采购方名称", { exact: true })
    .fill("Direct buyer");
  await screen.getByRole("button", { name: "创建报价单", exact: true }).click();
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await screen.getByRole("tab", { name: "产品项", exact: true }).click();
  await screen.getByRole("button", { name: "新增产品行" }).click();
  expect(
    (await provider.getList("romiku_formal_customers", list)).data,
  ).toEqual([]);
});

it.each([
  "pending_quote",
  "quoted",
  "following_up",
  "customer_no_reply",
  "won",
  "invalid",
])("saves final Quote detail status %s", async (status) => {
  const { screen, provider } = await setup("/quotes/q");

  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await screen.getByRole("tab", { name: "采购方与详情" }).click();
  await expect
    .element(screen.getByRole("option", { name: "已报价" }))
    .toHaveTextContent("已报价");
  await screen
    .getByLabelText("报价单状态", { exact: true })
    .selectOptions(status);
  await screen.getByRole("button", { name: "保存", exact: true }).click();

  await expect
    .poll(
      async () =>
        (await provider.getOne("romiku_quotes", { id: "q" })).data.status,
    )
    .toBe(status);
});

it("stages edits until Save, restores them on Cancel, and guards leaving with changes", async () => {
  const { screen, provider } = await setup("/quotes/q");
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await screen.getByRole("tab", { name: "采购方与详情" }).click();
  await screen
    .getByLabelText("采购方名称", { exact: true })
    .fill("Unsaved buyer");
  await screen.getByRole("link", { name: "返回报价单" }).click();
  expect(confirm).toHaveBeenCalled();
  await expect
    .element(screen.getByRole("heading", { name: "Q-001" }))
    .toBeVisible();
  await screen.getByRole("button", { name: "取消", exact: true }).click();
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await expect
    .element(screen.getByLabelText("采购方名称", { exact: true }))
    .toHaveValue("Ana");
  expect(
    (await provider.getOne("romiku_quotes", { id: "q" })).data
      .counterparty_snapshot,
  ).toEqual({ name: "Ana" });
  confirm.mockRestore();
});

it("confirms Inquiry items in saved position order rather than UUID order", async () => {
  const { screen } = await setup("/quotes/new?source=inquiry&sourceId=in", {
    inquiryItems: [
      { id: "a", inquiry_id: "in", position: 2, sku: "SECOND", quantity: 600 },
      { id: "z", inquiry_id: "in", position: 1, sku: "FIRST", quantity: 120 },
    ],
  });
  await expect
    .element(screen.getByRole("heading", { name: "确认询盘产品项" }))
    .toBeVisible();
  expect(
    Array.from(document.querySelectorAll('input[type="checkbox"]')).map(
      (input) => input.getAttribute("aria-label"),
    ),
  ).toEqual(["包含 FIRST", "包含 SECOND"]);
  await screen.getByRole("button", { name: "确认并创建报价单" }).click();
  await expect
    .poll(() => rpc.mock.calls)
    .toContainEqual([
      "romiku_quote_from_inquiry",
      { inquiry_id: "in", selected_item_ids: ["z", "a"] },
    ]);
});

it("exports an edited website Quote contact without changing its company or source Inquiry", async () => {
  const { normalizeQuoteExportModel } = await import("./quoteExportModel");
  const { screen, provider } = await setup("/quotes/q", {
    quote: {
      counterparty_snapshot: {
        name: "Ana",
        contact_name: "Ana",
        company: "ABC Nails",
        email: "ana@example.test",
      },
    },
  });
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await screen.getByRole("tab", { name: "采购方与详情" }).click();
  await screen.getByLabelText("采购方名称", { exact: true }).fill("Bob");
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await provider.getOne("romiku_quotes", { id: "q" })).data
          .counterparty_snapshot.name,
    )
    .toBe("Bob");
  const saved = (await provider.getOne("romiku_quotes", { id: "q" })).data;
  expect(normalizeQuoteExportModel(saved, []).buyer.company_name).toBe(
    "ABC Nails\nBob",
  );
  expect(saved.counterparty_snapshot).toMatchObject({
    name: "Bob",
    contact_name: "Bob",
    company: "ABC Nails",
    email: "ana@example.test",
  });
  expect(
    (await provider.getOne("romiku_website_inquiries", { id: "in" })).data
      .customer_name,
  ).toBe("Ana");
});
