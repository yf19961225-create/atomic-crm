import { afterEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter, Routes } from "react-router";
import { page } from "vitest/browser";
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
afterEach(() => vi.unstubAllGlobals());
async function setup(path: string) {
  await page.viewport(1440, 1200);
  const header = {
    status: "draft",
    currency: "USD",
    deposit_percent: 30,
    counterparty_snapshot: { name: "Original buyer" },
    bank_snapshot: { details: "Original bank" },
    terms_snapshot: { payment_terms: "Original terms" },
    freight: 0,
    discount: 0,
    other_expenses: 0,
  };
  const item = {
    sku: "A",
    quantity: 100,
    unit_price: 10,
    product_snapshot: { name: "Original product" },
    packing_snapshot: {},
  };
  const provider = fakeRestDataProvider({
    romiku_quotes: [{ id: "q", document_number: "Q-001", ...header }],
    romiku_quote_items: [{ id: "qi", quote_id: "q", ...item }],
    romiku_pis: [
      { id: "p", document_number: "PI-001", source_quote_id: "q", ...header },
    ],
    romiku_pi_items: [
      { id: "pii", pi_id: "p", source_quote_item_id: "qi", ...item },
    ],
    romiku_orders: [
      { id: "o", document_number: "SO-001", source_pi_id: "p", ...header },
    ],
    romiku_order_items: [
      { id: "oi", order_id: "o", source_pi_item_id: "pii", ...item },
    ],
    romiku_pi_totals: [],
    romiku_order_totals: [
      {
        id: "o",
        document_number: "SO-001",
        ...header,
        total: 1000,
        remaining_amount: 650,
      },
    ],
    romiku_payments: [],
    romiku_formal_customers: [],
    sales: [],
  });
  rpc.mockReset().mockImplementation((_name, args) =>
    Promise.resolve({
      data: args.target_kind === "pi" ? "p" : "o",
      error: null,
    }),
  );
  const screen = await render(
    <MemoryRouter initialEntries={[path]}>
      <CoreAdminContext dataProvider={provider}>
        <Routes>{romikuRoutes}</Routes>
      </CoreAdminContext>
    </MemoryRouter>,
  );
  return { screen, provider };
}
it("shows the database receivable in the Orders list and opens its detail", async () => {
  const { screen } = await setup("/orders");
  await expect
    .element(screen.getByRole("cell", { name: "USD 650.00", exact: true }))
    .toBeVisible();
  await screen.getByRole("link", { name: "SO-001", exact: true }).click();
  await expect
    .element(screen.getByRole("heading", { name: "SO-001" }))
    .toBeVisible();
});
it("writes the selected SUN5 Quote machine specification into the item snapshot textarea", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      if (input.startsWith("/api/product-catalog"))
        return Promise.resolve(
          new Response(
            JSON.stringify({
              result: [
                {
                  _id: "product-sun5",
                  sku: "SUN5",
                  isPublished: true,
                  name: { en: "Nail Lamp" },
                  category: {
                    slug: { current: "nail-lamps-plug-in" },
                    parent: {
                      slug: { current: "nail-lamps" },
                      parent: { slug: { current: "nail-machines" } },
                    },
                  },
                  parameters: [
                    {
                      label: { en: "Specifications" },
                      value: { en: "48W 24LEDS" },
                    },
                  ],
                  powerSupply: null,
                },
              ],
            }),
          ),
        );
      return Promise.resolve(
        new Response(
          JSON.stringify({
            images: {},
            powerSupplies: { SUN5: { en: "Plug-in" } },
          }),
        ),
      );
    }),
  );
  const { screen } = await setup("/quotes/q");
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await screen
    .getByLabelText("表格类型 / 单据语言", { exact: true })
    .selectOptions("en");
  const sku = screen
    .getByLabelText("搜索 SKU 或产品", { exact: true })
    .all()[0];
  await sku.fill("SUN");
  await expect.element(screen.getByText("SUN5", { exact: true })).toBeVisible();
  await screen.getByText("SUN5", { exact: true }).click();
  await expect
    .element(screen.getByLabelText("描述与规格", { exact: true }))
    .toHaveValue("48W 24LEDS Plug-in");
});
it.each([
  ["/quotes/q", "PI", "PI-001"],
  ["/quotes/q", "订单", "SO-001"],
  ["/pi/p", "订单", "SO-001"],
])(
  "confirms conversion from %s to %s before server copy",
  async (path, target, heading) => {
    const { screen } = await setup(path);
    await screen
      .getByRole("button", { name: `创建${target}`, exact: true })
      .click();
    expect(rpc).not.toHaveBeenCalled();
    await expect.element(screen.getByRole("dialog")).toBeVisible();
    await screen.getByRole("button", { name: "取消", exact: true }).click();
    expect(rpc).not.toHaveBeenCalled();
    await screen
      .getByRole("button", { name: `创建${target}`, exact: true })
      .click();
    await screen.getByRole("button", { name: `确认并创建${target}` }).click();
    await expect
      .element(screen.getByRole("heading", { name: heading }))
      .toBeVisible();
    expect(rpc).toHaveBeenCalledWith("romiku_convert_document", {
      source_kind: path.startsWith("/pi") ? "pi" : "quote",
      source_id: path.startsWith("/pi") ? "p" : "q",
      target_kind: target === "PI" ? "pi" : "order",
    });
  },
);
it.each([
  ["pi", "PI"],
  ["orders", "订单"],
])("creates direct %s and saves its own item", async (path, label) => {
  const { screen, provider } = await setup(`/${path}`);
  await screen.getByRole("link", { name: `新建${label}`, exact: true }).click();
  await screen
    .getByLabelText("采购方名称", { exact: true })
    .fill("Direct buyer");
  await screen
    .getByRole("button", { name: `创建${label}`, exact: true })
    .click();
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await screen.getByRole("button", { name: "新增产品行" }).click();
  const numbers = screen.getByRole("spinbutton");
  await numbers.nth(6).fill("10");
  await numbers.nth(7).fill("3.50");
  await screen.getByText("汇总", { exact: true }).click();
  await expect
    .element(screen.getByText("合计：USD 35.00", { exact: true }))
    .toBeVisible();
  expect(
    (await provider.getList("romiku_formal_customers", list)).data,
  ).toEqual([]);
});
it.each([
  ["pi", "PI", "romiku_pi_items", "pii"],
  ["orders", "订单", "romiku_order_items", "oi"],
])(
  "edits %s snapshots independently of Quote and PI sources",
  async (path, label, resource, itemId) => {
    const { screen, provider } = await setup(
      `/${path}/${path === "pi" ? "p" : "o"}`,
    );
    const quoteBefore = (await provider.getOne("romiku_quotes", { id: "q" }))
      .data;
    const piBefore = (await provider.getOne("romiku_pis", { id: "p" })).data;
    const sourceItem = (
      await provider.getOne(
        path === "pi" ? "romiku_quote_items" : "romiku_pi_items",
        { id: path === "pi" ? "qi" : "pii" },
      )
    ).data;
    await screen.getByRole("button", { name: "编辑", exact: true }).click();
    await screen.getByRole("spinbutton").nth(6).fill("200");
    await screen.getByText("⋯", { exact: true }).click();
    await screen.getByRole("button", { name: "更多详情", exact: true }).click();
    await screen
      .getByLabelText("规格", { exact: true })
      .fill("Own specification");
    await screen.getByRole("button", { name: "保存详情", exact: true }).click();
    await screen.getByRole("tab", { name: "采购方与详情" }).click();
    await screen
      .getByLabelText("采购方名称", { exact: true })
      .fill("Changed buyer");
    await screen.getByRole("button", { name: "保存", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await provider.getOne(resource, { id: itemId })).data.quantity,
      )
      .toBe(200);
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent(`${label}已保存。`);
    expect((await provider.getOne("romiku_quotes", { id: "q" })).data).toEqual(
      quoteBefore,
    );
    if (path === "orders")
      expect((await provider.getOne("romiku_pis", { id: "p" })).data).toEqual(
        piBefore,
      );
    expect(
      (
        await provider.getOne(
          path === "pi" ? "romiku_quote_items" : "romiku_pi_items",
          { id: path === "pi" ? "qi" : "pii" },
        )
      ).data,
    ).toEqual(sourceItem);
  },
);
it("records and corrects deposit/balance receipts without changing source documents", async () => {
  const { screen, provider } = await setup("/orders/o");
  const original = (await provider.getOne("romiku_pis", { id: "p" })).data;
  await expect
    .element(screen.getByText("应收定金: USD 300.00", { exact: true }))
    .toBeVisible();
  await screen.getByRole("button", { name: "添加收款" }).click();
  await screen.getByLabelText("收款金额", { exact: true }).fill("100");
  await screen.getByRole("button", { name: "保存收款", exact: true }).click();
  await expect
    .element(screen.getByText("待收款: USD 900.00", { exact: true }))
    .toBeVisible();
  await screen.getByRole("button", { name: "编辑收款" }).click();
  await screen.getByLabelText("收款金额", { exact: true }).fill("300");
  await screen.getByRole("button", { name: "保存收款", exact: true }).click();
  await expect
    .element(screen.getByText("定金待收: USD 0.00", { exact: true }))
    .toBeVisible();
  await screen.getByRole("button", { name: "添加收款" }).click();
  await screen
    .getByLabelText("收款类型", { exact: true })
    .selectOptions("balance");
  await screen.getByLabelText("收款金额", { exact: true }).fill("700");
  await screen.getByRole("button", { name: "保存收款", exact: true }).click();
  await expect
    .element(screen.getByText("待收款: USD 0.00", { exact: true }))
    .toBeVisible();
  expect((await provider.getOne("romiku_pis", { id: "p" })).data).toEqual(
    original,
  );
  expect(
    (await provider.getList("romiku_formal_customers", list)).data,
  ).toEqual([]);
});

it("does not allow receipts against an unsaved Order edit session", async () => {
  const { screen } = await setup("/orders/o");
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await expect
    .element(screen.getByRole("button", { name: "添加收款" }))
    .not.toBeInTheDocument();
});
