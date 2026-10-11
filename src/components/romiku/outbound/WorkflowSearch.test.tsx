import { beforeEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter } from "react-router";
import { WorkflowPage, type WorkflowConfig } from "./WorkflowPage";
import "@/index.css";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc }),
}));
beforeEach(() => rpc.mockReset());

it("submits Outbound text only on 搜索 while retaining the status filter", async () => {
  const provider = fakeRestDataProvider({
    romiku_outbound_companies: [{ id: "1", name: "Buyer", status: "contacted" }],
    sales: [],
  });
  rpc.mockResolvedValue({
    data: {
      groups: [{ resource_type: "outbound", total_count: 0, limit: 25, offset: 0, has_more: false, items: [] }],
    },
    error: null,
  });
  const config: WorkflowConfig = {
    kind: "outbound",
    title: "Outbound",
    statuses: ["new", "contacted"],
    fields: [],
  };
  const screen = await render(
    <MemoryRouter>
      <CoreAdminContext dataProvider={provider}>
        <WorkflowPage config={config} />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await screen.getByRole("combobox", { name: "筛选状态" }).selectOptions("contacted");
  const input = screen.getByRole("searchbox", { name: "搜索" });
  for (const text of ["B", "BQ", "BQV", "BQV10"]) await input.fill(text);
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(rpc).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "搜索", exact: true }).click();
  await expect.poll(() => rpc.mock.calls.length).toBe(1);
  expect(rpc).toHaveBeenLastCalledWith("romiku_global_search", expect.objectContaining({
    query: "BQV10",
    filters: { status: "contacted" },
    resource_types: ["outbound"],
  }));
});

it("stages Formal Customer text without changing its server list until Enter", async () => {
  const provider = fakeRestDataProvider({
    romiku_formal_customers: [{ id: "1", name: "Buyer", status: "active" }],
    sales: [],
  });
  const getList = vi.spyOn(provider, "getList");
  const config: WorkflowConfig = {
    kind: "customer",
    title: "Customers",
    statuses: ["active", "inactive"],
    fields: [],
  };
  const screen = await render(
    <MemoryRouter>
      <CoreAdminContext dataProvider={provider}>
        <WorkflowPage config={config} />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await expect.element(screen.getByText("Buyer")).toBeVisible();
  getList.mockClear();
  const input = screen.getByRole("searchbox", { name: "搜索" });
  await input.fill("Buyer");
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(getList.mock.calls.filter(([resource]) => resource === "romiku_formal_customers")).toHaveLength(0);
  await input.click();
  input.element().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await expect.poll(() => getList.mock.calls.filter(([resource, params]) =>
    resource === "romiku_formal_customers" && params.filter?.["name@ilike"] === "%Buyer%",
  ).length).toBe(1);
});
