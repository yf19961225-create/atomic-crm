import { afterEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter } from "react-router";
import { FulfillmentList } from "./FulfillmentPages";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc }),
}));
afterEach(() => vi.restoreAllMocks());
const group = {
  id: "o",
  document_number: "OD-QA",
  document_date: "2026-10-26",
  customer_name: "QA Buyer",
  production_count: 101,
  ongoing_count: 100,
  received_count: 1,
  cancelled_count: 0,
  effective_count: 101,
  latest_factory_due_at: null,
  latest_created_at: "2026-10-26T00:00:00Z",
};
async function setup(path = "/production") {
  rpc
    .mockReset()
    .mockResolvedValue({ data: { rows: [group], total: 26 }, error: null });
  const provider = fakeRestDataProvider({
    romiku_production_orders: Array.from({ length: 101 }, (_, n) => ({
      id: `p-${n}`,
      order_id: "o",
      document_number: `PO-${n}`,
      status: "scheduled",
      created_at: `2026-10-26T00:${String(n % 60).padStart(2, "0")}:00Z`,
    })),
    romiku_orders: [{ id: "o", document_number: "OD-QA" }],
    romiku_suppliers: [],
  });
  const read = vi.spyOn(provider, "getList");
  const screen = await render(
    <MemoryRouter initialEntries={[path]}>
      <CoreAdminContext dataProvider={provider}>
        <FulfillmentList kind="production" />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  return { screen, read, provider };
}
it("defaults to ongoing parent pages and expands bounded complete child history", async () => {
  const { screen, read } = await setup();
  await expect
    .element(screen.getByText("QA Buyer", { exact: true }))
    .toBeVisible();
  expect(rpc).toHaveBeenCalledWith(
    "romiku_list_production_order_groups",
    expect.objectContaining({ p_view: "ongoing", p_page: 1, p_page_size: 25 }),
  );
  expect(read).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "展开 OD-QA", exact: true }).click();
  await expect
    .element(screen.getByRole("link", { name: "PO-0", exact: true }))
    .toBeVisible();
  expect(read).toHaveBeenCalledWith(
    "romiku_production_orders",
    expect.objectContaining({
      filter: { order_id: "o" },
      pagination: { page: 1, perPage: 100 },
    }),
  );
  await screen
    .getByRole("button", { name: "加载更多生产子单", exact: true })
    .click();
  await expect
    .poll(() => read.mock.calls.some(([, p]) => p.pagination?.page === 2))
    .toBe(true);
  await expect
    .element(screen.getByText("已加载 101 / 101 张生产单", { exact: true }))
    .toBeVisible();
  await screen
    .getByRole("checkbox", { name: "选择 PO-0", exact: true })
    .click();
  await screen.getByRole("tab", { name: "已收货", exact: true }).click();
  await expect.poll(() => rpc.mock.calls.at(-1)?.[1].p_view).toBe("received");
  await expect
    .element(screen.getByRole("button", { name: /批量修改状态/ }))
    .not.toBeInTheDocument();
});
it("order link opens all-history view and parent pagination goes to RPC", async () => {
  const { screen } = await setup("/production?order=o");
  await expect
    .element(screen.getByText("QA Buyer", { exact: true }))
    .toBeVisible();
  expect(rpc).toHaveBeenCalledWith(
    "romiku_list_production_order_groups",
    expect.objectContaining({ p_view: "all", p_order_id: "o" }),
  );
  await screen.getByRole("button", { name: "下一页", exact: true }).click();
  await expect.poll(() => rpc.mock.calls.at(-1)?.[1].p_page).toBe(2);
});

it("caps expanded history selection at the existing 100-child RPC contract with an explicit limit", async () => {
  const { screen } = await setup();
  await screen.getByRole("button", { name: "展开 OD-QA", exact: true }).click();
  await screen
    .getByRole("button", { name: "加载更多生产子单", exact: true })
    .click();
  await expect
    .element(screen.getByText("已加载 101 / 101 张生产单", { exact: true }))
    .toBeVisible();
  await screen.getByRole("checkbox", { name: /全选当前页/ }).click();
  await expect
    .element(screen.getByText("已选择 100 条（当前页）", { exact: true }))
    .toBeVisible();
  await expect.element(screen.getByText(/每批最多选择 100 张/)).toBeVisible();
  const checked = Array.from(
    document.querySelectorAll<HTMLInputElement>(
      'input[aria-label^="选择 PO-"]',
    ),
  ).filter((i) => i.checked);
  expect(checked).toHaveLength(100);
  const remaining = Array.from(
    document.querySelectorAll<HTMLInputElement>(
      'input[aria-label^="选择 PO-"]',
    ),
  ).find((i) => !i.checked)!;
  expect(remaining.disabled).toBe(true);
  rpc.mockImplementation(async (name, args) =>
    name === "romiku_batch_status"
      ? {
          data: {
            ok: true,
            succeeded: args.ids.map((id: string) => ({ id, label: id })),
            failed: [],
          },
          error: null,
        }
      : { data: { rows: [group], total: 26 }, error: null },
  );
  await screen
    .getByRole("button", { name: "批量修改状态", exact: true })
    .click();
  await screen
    .getByRole("combobox", { name: "目标状态" })
    .selectOptions("received");
  await screen.getByRole("button", { name: "确认修改", exact: true }).click();
  await expect
    .poll(
      () =>
        rpc.mock.calls.find(([name]) => name === "romiku_batch_status")?.[1].ids
          .length,
    )
    .toBe(100);
  const ids = rpc.mock.calls.find(
    ([name]) => name === "romiku_batch_status",
  )![1].ids;
  expect(ids.every((id: string) => id.startsWith("p-"))).toBe(true);
  expect(new Set(ids).size).toBe(100);
});
it("reveals the matching child beyond the first 100 without hiding full history", async () => {
  const { screen, provider } = await setup();
  await provider.update("romiku_production_orders", {
    id: "p-100",
    data: { document_number: "ZZ-LAST" },
    previousData: { id: "p-100" },
  });
  rpc.mockResolvedValue({
    data: {
      rows: [
        {
          ...group,
          matched_child_count: 1,
          matched_children: [{ id: "p-100", document_number: "ZZ-LAST" }],
        },
      ],
      total: 1,
    },
    error: null,
  });
  await screen
    .getByRole("searchbox", { name: "搜索生产管理", exact: true })
    .fill("ZZ-LAST");
  await screen.getByRole("button", { name: "搜索", exact: true }).click();
  await expect
    .element(
      screen.getByRole("link", { name: "命中生产单 ZZ-LAST", exact: true }),
    )
    .toHaveAttribute("href", "/production/p-100");
  await screen.getByRole("button", { name: "展开 OD-QA", exact: true }).click();
  await expect
    .element(screen.getByText("已加载 100 / 101 张生产单", { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByLabelText("搜索命中 ZZ-LAST", { exact: true }))
    .not.toBeInTheDocument();
  await screen
    .getByRole("button", { name: "加载更多生产子单", exact: true })
    .click();
  await expect
    .element(screen.getByLabelText("搜索命中 ZZ-LAST", { exact: true }))
    .toBeVisible();
});
