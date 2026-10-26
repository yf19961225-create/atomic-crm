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
  return { screen, read };
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
