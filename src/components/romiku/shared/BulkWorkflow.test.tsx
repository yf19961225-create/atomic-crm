import { beforeEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter } from "react-router";
import { QuoteList } from "../quotes/QuotePages";
import { DocumentList } from "../orders/DocumentPages";
import { FulfillmentList } from "../production/FulfillmentPages";
import { WorkflowPage } from "../outbound/WorkflowPage";
import { statusOptions, type WorkflowResource } from "./workflowStatus";
import { OrderPayments } from "../payments/OrderPayments";
import { paymentSummary } from "../payments/paymentWorkflow";
import "@/index.css";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc }),
}));
beforeEach(() => {
  rpc.mockReset();
});
const tables = {
  quote: "romiku_quote_totals",
  pi: "romiku_pi_totals",
  order: "romiku_order_totals",
  production: "romiku_production_orders",
  packing: "romiku_packing_lists",
  website_inquiry: "romiku_website_inquiries",
  outbound: "romiku_outbound_companies",
};
async function setup(kind: WorkflowResource, count = 26) {
  const records = Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    document_number: `DOC-${i + 1}`,
    name: `Buyer ${i + 1}`,
    customer_name: `Buyer ${i + 1}`,
    status: statusOptions(kind)[0].value,
    archived_at: null,
    currency: "USD",
    total: 10,
    remaining_amount: 10,
    created_at: String(i).padStart(3, "0"),
    submitted_at: new Date().toISOString(),
  }));
  const provider = fakeRestDataProvider({
    [tables[kind]]: records,
    romiku_orders: [],
    sales: [],
    romiku_outbound_contacts: [],
    romiku_outbound_followups: [],
    romiku_website_inquiry_followups: [],
  });
  const screen = await render(
    <MemoryRouter>
      <CoreAdminContext dataProvider={provider}>
        {kind === "quote" ? (
          <QuoteList />
        ) : kind === "pi" || kind === "order" ? (
          <DocumentList kind={kind} />
        ) : kind === "production" || kind === "packing" ? (
          <FulfillmentList kind={kind} />
        ) : (
          <WorkflowPage
            config={{
              kind: kind === "website_inquiry" ? "inquiry" : "outbound",
              title: "Test",
              statuses: statusOptions(kind).map((o) => o.value),
              fields: [],
            }}
          />
        )}
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await expect
    .element(screen.getByRole("checkbox", { name: "全选当前页" }))
    .toBeEnabled();
  return { screen, provider };
}
it.each(Object.keys(tables) as WorkflowResource[])(
  "%s current-page selection, deselect, filter/search/page resets and permitted toolbar",
  async (kind) => {
    const { screen } = await setup(kind);
    await screen
      .getByRole("checkbox", { name: /选择 DOC-/ })
      .first()
      .click();
    await expect
      .element(screen.getByText("已选择 1 条（当前页）"))
      .toBeVisible();
    await screen
      .getByRole("checkbox", { name: /选择 DOC-/ })
      .first()
      .click();
    await expect
      .element(screen.getByRole("button", { name: "取消选择" }))
      .not.toBeInTheDocument();
    await screen.getByRole("checkbox", { name: "全选当前页" }).click();
    await expect
      .element(screen.getByText("已选择 25 条（当前页）"))
      .toBeVisible();
    if (kind === "order") {
      await expect
        .element(screen.getByRole("button", { name: "批量归档" }))
        .toBeVisible();
      await expect
        .element(screen.getByRole("button", { name: "批量修改状态" }))
        .not.toBeInTheDocument();
    } else
      await expect
        .element(screen.getByRole("button", { name: "批量修改状态" }))
        .toBeVisible();
    await screen.getByRole("button", { name: "下一页" }).click();
    await expect
      .element(screen.getByRole("button", { name: "取消选择" }))
      .not.toBeInTheDocument();
    await screen.getByRole("checkbox", { name: "全选当前页" }).click();
    await expect
      .element(screen.getByText("已选择 1 条（当前页）"))
      .toBeVisible();
    await screen
      .getByRole("combobox", {
        name:
          kind === "website_inquiry" || kind === "outbound"
            ? "筛选状态"
            : "状态",
        exact: true,
      })
      .selectOptions(statusOptions(kind)[0].value);
    await expect
      .element(screen.getByRole("button", { name: "取消选择" }))
      .not.toBeInTheDocument();
    await screen.getByRole("checkbox", { name: "全选当前页" }).click();
    rpc.mockResolvedValue({
      data: {
        groups: [
          {
            resource_type: kind,
            items: [],
            total_count: 0,
            has_more: false,
            limit: 25,
            offset: 0,
          },
        ],
      },
      error: null,
    });
    await screen
      .getByRole(
        kind === "website_inquiry" || kind === "outbound"
          ? "textbox"
          : "searchbox",
        {
          name:
            kind === "website_inquiry" || kind === "outbound"
              ? "搜索"
              : undefined,
        },
      )
      .fill("needle");
    await expect
      .element(screen.getByRole("button", { name: "取消选择" }))
      .not.toBeInTheDocument();
  },
);
it("bulk status sends one request, updates count under filter and preserves filter", async () => {
  const { screen, provider } = await setup("quote", 2);
  await screen
    .getByRole("combobox", { name: "状态", exact: true })
    .selectOptions("pending_quote");
  await screen.getByRole("checkbox", { name: "全选当前页" }).click();
  await screen
    .getByRole("button", { name: "批量修改状态", exact: true })
    .click();
  await screen.getByRole("combobox", { name: "目标状态" }).selectOptions("won");
  rpc.mockImplementation(async (name, args) => {
    if (!args) throw new Error(`Unexpected RPC ${name}`);
    if (name === "romiku_batch_status")
      for (const id of args.ids)
        await provider.update("romiku_quote_totals", {
          id,
          data: { status: "won" },
          previousData: { id },
        });
    return {
      data: {
        ok: true,
        succeeded: args.ids.map((id: string) => ({ id, label: id })),
        failed: [],
      },
      error: null,
    };
  });
  await screen.getByRole("button", { name: "确认修改" }).click();
  await expect
    .element(screen.getByText("成功 2 条；失败 0 条。"))
    .toBeVisible();
  expect(rpc).toHaveBeenCalledExactlyOnceWith("romiku_batch_status", {
    kind: "quote",
    ids: expect.arrayContaining(["1", "2"]),
    target_status: "won",
  });
  await screen
    .getByRole("button", { name: "关闭", exact: true })
    .first()
    .click();
  await expect
    .element(screen.getByRole("combobox", { name: "状态", exact: true }))
    .toHaveValue("pending_quote");
  await expect
    .element(screen.getByText("第 1 页 · 共 0 张报价单"))
    .toBeVisible();
});
it("mixed delete preflights once, Cancel does not delete, execution only eligible and reports later blockers", async () => {
  const { screen } = await setup("pi", 2);
  rpc.mockImplementation(async (name) => ({
    data:
      name === "romiku_delete_preflight"
        ? {
            ok: true,
            deletable: [{ id: "1", label: "PI-1" }],
            blocked: [
              { id: "2", label: "PI-2", reasons: ["已有订单，无法删除。"] },
            ],
          }
        : {
            ok: true,
            succeeded: [],
            failed: [
              {
                id: "1",
                label: "PI-1",
                message: "该 PI 已有 1 张订单，无法删除。",
                status: "blocked_at_execution",
              },
            ],
          },
    error: null,
  }));
  await screen.getByRole("checkbox", { name: "全选当前页" }).click();
  await screen.getByRole("button", { name: "批量删除", exact: true }).click();
  await expect
    .element(screen.getByText("PI-2：已有订单，无法删除。"))
    .toBeVisible();
  await screen.getByRole("button", { name: "取消", exact: true }).click();
  expect(rpc).toHaveBeenCalledTimes(1);
  await screen.getByRole("button", { name: "批量删除", exact: true }).click();
  await screen.getByRole("button", { name: "确认删除可删除记录" }).click();
  await expect
    .element(screen.getByText("PI-1：该 PI 已有 1 张订单，无法删除。"))
    .toBeVisible();
  await expect
    .element(screen.getByText("PI-2：已有订单，无法删除。"))
    .toBeVisible();
  expect(rpc).toHaveBeenLastCalledWith("romiku_batch_delete", {
    kind: "pi",
    ids: ["1"],
  });
});
it("Payment totals exclude void history and allow a correct new entry", () => {
  const a = { kind: "deposit", amount: 3000, status: "active" };
  const v = { ...a, status: "voided" };
  expect(paymentSummary(10000, 30, [a])).toMatchObject({
    totalReceived: 3000,
    outstanding: 7000,
  });
  expect(paymentSummary(10000, 30, [v])).toMatchObject({
    totalReceived: 0,
    outstanding: 10000,
  });
  expect(paymentSummary(10000, 30, [v, a])).toMatchObject({
    totalReceived: 3000,
    outstanding: 7000,
  });
});
it("Payment void requires reason, Cancel does nothing, confirmed void preserves audit and refreshes totals", async () => {
  const provider = fakeRestDataProvider({
    romiku_payments: [
      {
        id: "p",
        order_id: "o",
        amount: 3000,
        kind: "deposit",
        status: "active",
        received_at: "2026-10-06",
        created_at: "2026-10-06",
        payment_reference: "REF",
      },
    ],
  });
  const screen = await render(
    <CoreAdminContext dataProvider={provider}>
      <OrderPayments order={{ id: "o", currency: "USD" }} total={10000} />
    </CoreAdminContext>,
  );
  await screen.getByRole("button", { name: "收款更多操作 USD 3000" }).click();
  await screen.getByRole("menuitem", { name: "作废收款" }).click();
  await expect
    .element(screen.getByRole("button", { name: "确认作废" }))
    .toBeDisabled();
  await screen.getByRole("button", { name: "取消", exact: true }).click();
  expect(rpc).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "收款更多操作 USD 3000" }).click();
  await screen.getByRole("menuitem", { name: "作废收款" }).click();
  await screen
    .getByRole("textbox", { name: "作废原因（必填）" })
    .fill("重复录入");
  rpc.mockImplementation(async () => {
    await provider.update("romiku_payments", {
      id: "p",
      data: {
        status: "voided",
        void_reason: "重复录入",
        voided_by_label: "Tester",
        voided_at: "2026-10-06",
      },
      previousData: { id: "p" },
    });
    return { data: { ok: true }, error: null };
  });
  await screen.getByRole("button", { name: "确认作废" }).click();
  await expect
    .element(screen.getByText("已作废", { exact: true }))
    .toBeVisible();
  await expect.element(screen.getByText("已收合计: USD 0.00")).toBeVisible();
  await expect.element(screen.getByText("待收款: USD 10000.00")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "编辑收款" }))
    .not.toBeInTheDocument();
  expect(rpc).toHaveBeenCalledExactlyOnceWith("romiku_void_payment", {
    payment_id: "p",
    reason: "重复录入",
  });
});
it.each(["production", "packing"] as const)(
  "%s displays the parent business number and links by its internal ID",
  async (kind) => {
    const provider = fakeRestDataProvider({
      [kind === "production"
        ? "romiku_production_orders"
        : "romiku_packing_lists"]: [
        {
          id: "child",
          document_number: "CHILD",
          order_id: "parent-uuid",
          status: kind === "production" ? "pending_send" : "draft",
        },
      ],
      romiku_orders: [{ id: "parent-uuid", document_number: "OD261006999" }],
    });
    const screen = await render(
      <MemoryRouter>
        <CoreAdminContext dataProvider={provider}>
          <FulfillmentList kind={kind} />
        </CoreAdminContext>
      </MemoryRouter>,
    );
    await expect
      .element(screen.getByRole("link", { name: "OD261006999" }))
      .toHaveAttribute("href", "/orders/parent-uuid");
  },
);
it("single PI deletion clears all selection", async () => {
  const { screen, provider } = await setup("pi", 2);
  rpc.mockImplementation(async (name, args) => {
    if (name === "romiku_delete_record")
      await provider.delete("romiku_pi_totals", { id: args.record_id });
    return { data: { ok: true }, error: null };
  });
  await screen.getByRole("checkbox", { name: "全选当前页" }).click();
  await screen.getByRole("button", { name: "更多操作 DOC-1" }).click();
  await screen.getByRole("menuitem", { name: "删除", exact: true }).click();
  await screen.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect
    .element(screen.getByRole("button", { name: "取消选择" }))
    .not.toBeInTheDocument();
});
it("single Order archive keeps confirmation open and reports per-record failure", async () => {
  const { screen } = await setup("order", 1);
  rpc.mockResolvedValue({
    data: {
      ok: true,
      succeeded: [],
      failed: [
        { id: "1", label: "DOC-1", message: "归档失败，请刷新后重试。" },
      ],
    },
    error: null,
  });
  await screen.getByRole("button", { name: "更多操作 DOC-1" }).click();
  await screen.getByRole("menuitem", { name: "归档订单" }).click();
  await screen.getByRole("button", { name: "确认归档" }).click();
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("归档失败，请刷新后重试。");
  await expect
    .element(screen.getByRole("button", { name: "确认归档" }))
    .toBeVisible();
});
