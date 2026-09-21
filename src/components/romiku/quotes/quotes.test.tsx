import { expect, it, vi } from "vitest";
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
const setup = async (path: string) => {
  await page.viewport(1440, 1000);
  rpc.mockReset().mockResolvedValue({ data: "q", error: null });
  const provider = fakeRestDataProvider({
    romiku_quotes: [
      {
        id: "q",
        document_number: "Q-001",
        status: "draft",
        currency: "USD",
        counterparty_snapshot: { name: "Ana" },
        source_website_inquiry_id: "in",
        freight: 20,
        other_expenses: 15,
        discount: 10,
        terms_snapshot: {},
      },
    ],
    romiku_quote_totals: [],
    romiku_quote_items: [
      {
        id: "qi",
        quote_id: "q",
        source_website_inquiry_item_id: "i1",
        sku: "A",
        quantity: 100,
        unit_price: 2,
        product_snapshot: { name: "Original snapshot" },
        packing_snapshot: {},
      },
    ],
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
    romiku_website_inquiry_items: [
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
  await screen.getByRole("link", { name: "新建报价单" }).click();
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

it("renders Chinese Quote status labels while preserving the stored enum value", async () => {
  const { screen, provider } = await setup("/quotes/q");

  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await screen.getByRole("tab", { name: "采购方与详情" }).click();
  await expect
    .element(screen.getByRole("option", { name: "已发送" }))
    .toHaveTextContent("已发送");
  await screen
    .getByLabelText("报价单状态", { exact: true })
    .selectOptions("sent");
  await screen.getByRole("button", { name: "保存", exact: true }).click();

  await expect
    .poll(
      async () =>
        (await provider.getOne("romiku_quotes", { id: "q" })).data.status,
    )
    .toBe("sent");
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
