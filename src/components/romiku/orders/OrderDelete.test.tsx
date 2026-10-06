import { beforeEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter } from "react-router";
import { DocumentList } from "./DocumentPages";
import "@/index.css";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc }),
}));
beforeEach(() => {
  rpc.mockReset();
});
const entry = (id: string, blocked = false) => ({
  order_id: id,
  document_number: `OD-${id}`,
  production_count: 1,
  packing_count: 0,
  payment_count: 0,
  delete_mode: blocked ? "blocked" : "cascade_production",
  cascade_productions: [
    {
      id: `p-${id}`,
      document_number: `OD-${id}-P01`,
      status: "pending",
      status_label: "待生产",
    },
  ],
  blocked_reasons: blocked ? ["已有 1 张装箱单，无法删除。"] : [],
});
async function setup(count = 3) {
  const provider = fakeRestDataProvider({
    sales: [],
    romiku_order_totals: Array.from({ length: count }, (_, i) => ({
      id: String(i + 1),
      document_number: `OD-${i + 1}`,
      status: "confirmed",
      currency: "USD",
      total: 0,
      created_at: String(i).padStart(3, "0"),
    })),
  });
  const screen = await render(
    <MemoryRouter>
      <CoreAdminContext dataProvider={provider}>
        <DocumentList kind="order" />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await expect
    .element(screen.getByText(`第 1 页 · 共 ${count} 条`))
    .toBeVisible();
  return { screen, provider };
}
it("selects only the current page and clears on page, status and search changes", async () => {
  const { screen } = await setup(26);
  await expect
    .element(screen.getByRole("button", { name: "批量删除", exact: true }))
    .not.toBeInTheDocument();
  await screen.getByRole("checkbox", { name: "全选当前页" }).click();
  await expect
    .element(screen.getByText("已选择当前页 25 张订单"))
    .toBeVisible();
  await screen.getByRole("button", { name: "下一页" }).click();
  await expect
    .element(screen.getByRole("button", { name: "批量删除", exact: true }))
    .not.toBeInTheDocument();
  await screen.getByRole("checkbox", { name: "全选当前页" }).click();
  await expect.element(screen.getByText("已选择当前页 1 张订单")).toBeVisible();
  await screen
    .getByRole("combobox", { name: "状态", exact: true })
    .selectOptions("confirmed");
  await expect
    .element(screen.getByRole("button", { name: "批量删除", exact: true }))
    .not.toBeInTheDocument();
  await screen.getByRole("checkbox", { name: "全选当前页" }).click();
  await screen.getByRole("searchbox").fill("needle");
  await expect
    .element(screen.getByRole("button", { name: "批量删除", exact: true }))
    .not.toBeInTheDocument();
});
it("preflights once, cancels without delete, and blocked single has only Close", async () => {
  const { screen } = await setup(1);
  rpc.mockResolvedValue({
    data: { ok: true, deletable: [], blocked: [entry("1", true)] },
    error: null,
  });
  await screen.getByRole("button", { name: "更多操作 OD-1" }).click();
  await screen.getByRole("menuitem", { name: "删除", exact: true }).click();
  await expect
    .element(screen.getByText("已有 1 张装箱单，无法删除。"))
    .toBeVisible();
  expect(rpc).toHaveBeenCalledExactlyOnceWith("romiku_order_delete_preflight", {
    ids: ["1"],
  });
  await expect
    .element(screen.getByRole("button", { name: /确认删除|删除订单及/ }))
    .not.toBeInTheDocument();
  await screen
    .getByRole("button", { name: "关闭", exact: true })
    .first()
    .click();
  expect(rpc).toHaveBeenCalledTimes(1);
});
it("batch deletes only eligible IDs, reports execution blocking, clears selection and updates count", async () => {
  const { screen, provider } = await setup();
  rpc.mockImplementation(async (name, args) => {
    if (name === "romiku_order_delete_preflight")
      return {
        data: {
          ok: true,
          deletable: [entry("1"), entry("2")],
          blocked: [entry("3", true)],
        },
        error: null,
      };
    expect(name).toBe("romiku_batch_delete_orders");
    expect(args.ids).toEqual(["1", "2"]);
    await provider.delete("romiku_order_totals", { id: "1" });
    return {
      data: {
        ok: true,
        deleted: [{ order_id: "1", document_number: "OD-1" }],
        failed: [
          {
            order_id: "2",
            document_number: "OD-2",
            status: "blocked_at_execution",
            message: "OD-2-P01 已有 1 条生产跟进记录，无法删除。",
          },
        ],
      },
      error: null,
    };
  });
  await screen.getByRole("checkbox", { name: "全选当前页" }).click();
  await screen.getByRole("button", { name: "批量删除", exact: true }).click();
  await expect.element(screen.getByText("OD-1-P01 · 待生产")).toBeVisible();
  await screen.getByRole("button", { name: "删除 2 张可删除订单" }).click();
  await expect
    .element(screen.getByText("删除成功 1 张；未删除 2 张"))
    .toBeVisible();
  await expect.element(screen.getByText(/执行时新增依赖/)).toBeVisible();
  await screen
    .getByRole("button", { name: "关闭", exact: true })
    .first()
    .click();
  await expect.element(screen.getByText("第 1 页 · 共 2 条")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "批量删除", exact: true }))
    .not.toBeInTheDocument();
  expect(rpc).toHaveBeenCalledTimes(2);
});
it("safe single cancellation never invokes deletion", async () => {
  const { screen } = await setup(1);
  rpc.mockResolvedValue({
    data: { ok: true, deletable: [entry("1")], blocked: [] },
    error: null,
  });
  await screen.getByRole("button", { name: "更多操作 OD-1" }).click();
  await screen.getByRole("menuitem", { name: "删除", exact: true }).click();
  await expect
    .element(screen.getByRole("button", { name: "删除订单及未执行生产单" }))
    .toBeVisible();
  await screen.getByRole("button", { name: "取消", exact: true }).click();
  expect(rpc).toHaveBeenCalledTimes(1);
});
it("batch deletion of the last page falls back to a valid page", async () => {
  const { screen, provider } = await setup(26);
  rpc.mockImplementation(async (name) => {
    if (name === "romiku_order_delete_preflight")
      return {
        data: { ok: true, deletable: [entry("1")], blocked: [] },
        error: null,
      };
    await provider.delete("romiku_order_totals", { id: "1" });
    return {
      data: {
        ok: true,
        deleted: [{ order_id: "1", document_number: "OD-1" }],
        failed: [],
      },
      error: null,
    };
  });
  await screen.getByRole("button", { name: "下一页" }).click();
  await screen
    .getByRole("checkbox", { name: "选择 OD-1", exact: true })
    .click();
  await screen.getByRole("button", { name: "批量删除", exact: true }).click();
  await screen.getByRole("button", { name: "删除 1 张可删除订单" }).click();
  await screen
    .getByRole("button", { name: "关闭", exact: true })
    .first()
    .click();
  await expect.element(screen.getByText("第 1 页 · 共 25 条")).toBeVisible();
});

it("preserves search and status after deleting the current search results", async () => {
  const { screen, provider } = await setup(3);
  let deleted = false;
  rpc.mockImplementation(async (name, args) => {
    if (name === "romiku_global_search") {
      expect(args.query).toBe("QA");
      expect(args.filters).toEqual({ status: "confirmed" });
      return {
        data: {
          groups: [
            {
              resource_type: "order",
              total_count: deleted ? 0 : 1,
              limit: 25,
              offset: 0,
              has_more: false,
              items: deleted
                ? []
                : [
                    {
                      id: "2",
                      title: "OD-2",
                      subtitle: "",
                      matched_fields: [],
                      rank: 0,
                    },
                  ],
            },
          ],
        },
        error: null,
      };
    }
    if (name === "romiku_order_delete_preflight") {
      expect(args.ids).toEqual(["2"]);
      return {
        data: { ok: true, deletable: [entry("2")], blocked: [] },
        error: null,
      };
    }
    expect(args.ids).toEqual(["2"]);
    await provider.delete("romiku_order_totals", { id: "2" });
    deleted = true;
    return {
      data: {
        ok: true,
        deleted: [{ order_id: "2", document_number: "OD-2" }],
        failed: [],
      },
      error: null,
    };
  });
  await screen
    .getByRole("combobox", { name: "状态", exact: true })
    .selectOptions("confirmed");
  await screen.getByRole("searchbox").fill("QA");
  await expect.element(screen.getByText("第 1 页 · 共 1 条")).toBeVisible();
  await screen.getByRole("checkbox", { name: "全选当前页" }).click();
  await screen.getByRole("button", { name: "批量删除", exact: true }).click();
  await screen.getByRole("button", { name: "删除 1 张可删除订单" }).click();
  await screen
    .getByRole("button", { name: "关闭", exact: true })
    .first()
    .click();
  await expect.element(screen.getByText("第 1 页 · 共 0 条")).toBeVisible();
  await expect.element(screen.getByRole("searchbox")).toHaveValue("QA");
  await expect
    .element(screen.getByRole("combobox", { name: "状态", exact: true }))
    .toHaveValue("confirmed");
  expect(
    (
      await provider.getList("romiku_order_totals", {
        pagination: { page: 1, perPage: 25 },
        sort: { field: "id", order: "ASC" },
        filter: {},
      })
    ).total,
  ).toBe(2);
});
it("all-blocked batch and transport failures never leave an active delete action", async () => {
  const { screen } = await setup(1);
  rpc.mockResolvedValueOnce({
    data: { ok: true, deletable: [], blocked: [entry("1", true)] },
    error: null,
  });
  await screen.getByRole("checkbox", { name: "全选当前页" }).click();
  await screen.getByRole("button", { name: "批量删除", exact: true }).click();
  await expect.element(screen.getByText("无法删除：1 张")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: /删除 \d+ 张可删除订单/ }))
    .not.toBeInTheDocument();
  await screen
    .getByRole("button", { name: "关闭", exact: true })
    .first()
    .click();
  rpc.mockResolvedValueOnce({
    data: { ok: true, deletable: [entry("1")], blocked: [] },
    error: null,
  });
  rpc.mockResolvedValueOnce({
    data: null,
    error: { message: "private FK secret" },
  });
  await screen.getByRole("button", { name: "批量删除", exact: true }).click();
  await screen.getByRole("button", { name: "删除 1 张可删除订单" }).click();
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("未能确认删除结果");
  await expect
    .element(screen.getByText("private FK secret"))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("button", { name: /删除 \d+ 张可删除订单/ }))
    .not.toBeInTheDocument();
});
