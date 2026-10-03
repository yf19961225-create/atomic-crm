import { beforeEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter } from "react-router";
import { QuoteList } from "../quotes/QuotePages";
import { FulfillmentList } from "../production/FulfillmentPages";
import "@/index.css";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc }),
}));
const item = (id: string) => ({
  id,
  title: id,
  subtitle: "",
  matched_fields: ["SKU"],
  rank: 0,
});
beforeEach(() => rpc.mockReset());
it("uses server search count and rank order for quote pages", async () => {
  const provider = fakeRestDataProvider({
    romiku_quote_totals: [
      {
        id: "a",
        document_number: "A",
        status: "draft",
        currency: "USD",
        total: 1,
        created_at: "2026-01-02",
      },
      {
        id: "b",
        document_number: "B",
        status: "draft",
        currency: "USD",
        total: 1,
        created_at: "2026-01-01",
      },
    ],
  });
  rpc.mockResolvedValue({
    data: {
      groups: [
        {
          resource_type: "quote",
          total_count: 26,
          limit: 25,
          offset: 0,
          has_more: true,
          items: [item("b"), item("a")],
        },
      ],
    },
    error: null,
  });
  const screen = await render(
    <MemoryRouter>
      <CoreAdminContext dataProvider={provider}>
        <QuoteList />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await screen.getByRole("searchbox", { name: "搜索报价单" }).fill("widget");
  await expect
    .element(screen.getByText("第 1 页 · 共 26 张报价单"))
    .toBeVisible();
  expect(rpc).toHaveBeenCalledWith("romiku_global_search", {
    query: "widget",
    resource_types: ["quote"],
    limit: 25,
    offset: 0,
    filters: {},
  });
  expect(
    Array.from(
      document.querySelectorAll('a[href="/quotes/a"],a[href="/quotes/b"]'),
    ).map((link) => link.textContent),
  ).toEqual(["B", "A"]);
});
it("passes an order filter to production search", async () => {
  const provider = fakeRestDataProvider({ romiku_production_orders: [] });
  rpc.mockResolvedValue({
    data: {
      groups: [
        {
          resource_type: "production",
          total_count: 0,
          limit: 25,
          offset: 0,
          has_more: false,
          items: [],
        },
      ],
    },
    error: null,
  });
  const screen = await render(
    <MemoryRouter initialEntries={["/production?order=order-7"]}>
      <CoreAdminContext dataProvider={provider}>
        <FulfillmentList kind="production" />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await screen.getByRole("searchbox", { name: "搜索生产管理" }).fill("widget");
  await expect.element(screen.getByText("第 1 页 · 共 0 条")).toBeVisible();
  expect(rpc).toHaveBeenCalledWith("romiku_global_search", {
    query: "widget",
    resource_types: ["production"],
    limit: 25,
    offset: 0,
    filters: { order_id: "order-7" },
  });
});
