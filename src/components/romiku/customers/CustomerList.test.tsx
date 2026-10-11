import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter } from "react-router";
import { CustomerPage } from "./CustomerPage";
import "@/index.css";
vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({
    rpc: vi.fn().mockResolvedValue({
      data: {
        ok: true,
        orders: [],
        items: [],
        summary: { totals: [] },
        total_count: 0,
      },
    }),
  }),
}));
it("selects only the current page, clears selection on scope changes, and resolves profile owners", async () => {
  const screen = await render(
    <MemoryRouter>
      <CoreAdminContext
        dataProvider={fakeRestDataProvider({
          romiku_formal_customers: Array.from({ length: 26 }, (_, i) => ({
            id: `${i}`,
            name: `Buyer ${String(i).padStart(2, "0")}`,
            status: i === 25 ? "inactive" : "active",
            owner_id: i % 2 ? "a" : "b",
          })),
          sales: [
            { id: 1, user_id: "a", first_name: "吴娜", last_name: "" },
            { id: 2, user_id: "b", first_name: "杨锋", last_name: "" },
          ],
          romiku_customer_contacts: [],
        })}
      >
        <CustomerPage />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await expect.element(screen.getByText("吴娜").first()).toBeVisible();
  await expect.element(screen.getByText("杨锋").first()).toBeVisible();
  await screen.getByRole("checkbox", { name: "全选当前页" }).click();
  await expect.element(screen.getByText("已选择 25 个客户")).toBeVisible();
  await screen.getByRole("button", { name: "下一页", exact: true }).click();
  await expect
    .element(screen.getByRole("button", { name: "批量删除" }))
    .not.toBeInTheDocument();
  await screen.getByRole("checkbox", { name: "全选当前页" }).click();
  await expect.element(screen.getByText("已选择 1 个客户")).toBeVisible();
  await screen
    .getByRole("combobox", { name: "筛选状态" })
    .selectOptions("inactive");
  await expect
    .element(screen.getByRole("button", { name: "批量删除" }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByText("Buyer 25", { exact: true }))
    .toBeVisible();
  await screen.getByRole("checkbox", { name: "全选当前页" }).click();
  await screen.getByRole("textbox", { name: "搜索" }).fill("Buyer");
  await expect
    .element(screen.getByRole("button", { name: "批量删除" }))
    .not.toBeInTheDocument();
  await screen.getByRole("textbox", { name: "搜索" }).fill("");
  await screen.getByRole("button", { name: "客户操作 Buyer 25" }).click();
  await expect
    .element(screen.getByRole("menuitem", { name: "查看", exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("menuitem", { name: "编辑", exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("menuitem", { name: "启用", exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("menuitem", { name: "删除", exact: true }))
    .toBeVisible();
  await screen.getByRole("menuitem", { name: "编辑", exact: true }).click();
  await expect
    .element(screen.getByRole("textbox", { name: "客户名称" }))
    .toHaveValue("Buyer 25");
  await screen.getByRole("button", { name: "关闭", exact: true }).click();
  await screen.getByRole("button", { name: "客户操作 Buyer 25" }).click();
  await screen.getByRole("menuitem", { name: "查看", exact: true }).click();
  await expect
    .element(screen.getByRole("tab", { name: "业务记录", exact: true }))
    .toHaveAttribute("aria-selected", "true");
  await expect
    .element(screen.getByText("状态：停用", { exact: true }))
    .toBeVisible();
});
