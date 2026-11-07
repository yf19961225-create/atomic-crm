import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { commands } from "vitest/browser";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter } from "react-router";
import { DocumentList } from "./DocumentPages";
vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc: vi.fn() }),
}));
it("shows exactly the requested order columns, separate delivery/order dates and unchanged amounts", async () => {
  await commands.setTimezone("Asia/Shanghai");
  const provider = fakeRestDataProvider({
    sales: [],
    romiku_order_totals: [
      {
        id: "o",
        document_number: "OD-DATE",
        document_date: "2026-10-20",
        expected_delivery_at: "2026-10-31T16:00:00Z",
        status: "confirmed",
        archived_at: null,
        currency: "CNY",
        total: 7370,
        remaining_amount: 5159,
      },
      {
        id: "empty",
        document_number: "OD-EMPTY",
        document_date: "2026-10-21",
        expected_delivery_at: null,
        status: "confirmed",
        archived_at: null,
        currency: "CNY",
        total: 0,
        remaining_amount: 0,
      },
    ],
  });
  const screen = await render(
    <MemoryRouter>
      <CoreAdminContext dataProvider={provider}>
        <DocumentList kind="order" />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await expect
    .element(screen.getByRole("link", { name: "OD-DATE", exact: true }))
    .toBeVisible();
  expect(
    Array.from(document.querySelectorAll("thead th"))
      .slice(1)
      .map((e) => e.textContent),
  ).toEqual([
    "订单",
    "采购方",
    "状态",
    "送货日期",
    "订单日期",
    "合计",
    "待收款",
    "操作",
  ]);
  await expect
    .element(screen.getByText("2026-11-01", { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText("2026-10-20", { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText("CNY 7370.00", { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText("CNY 5159.00", { exact: true }))
    .toBeVisible();
  const emptyRow = Array.from(document.querySelectorAll("tbody tr")).find(
    (row) => row.textContent?.includes("OD-EMPTY"),
  );
  expect(emptyRow?.querySelectorAll("td")[4].textContent).toBe("设置日期");
  await expect
    .element(screen.getByRole("combobox", { name: "订单状态" }).first())
    .toBeVisible();
});
