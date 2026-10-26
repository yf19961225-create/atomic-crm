import { beforeEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter } from "react-router";
import { QuoteList } from "../quotes/QuotePages";
import { FulfillmentList } from "../production/FulfillmentPages";
import { DocumentList } from "../orders/DocumentPages";
import { QueryClient } from "@tanstack/react-query";
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
  const search = screen.getByRole("searchbox", { name: "搜索报价单" });
  for (const value of ["w", "wi", "wid", "widget"]) await search.fill(value);
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(rpc).not.toHaveBeenCalled();
  await search.click();
  await userEvent.keyboard("{Enter}");
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
it("passes an order filter to parent production search without searching while typing", async () => {
  const provider = fakeRestDataProvider({ romiku_production_orders: [] });
  rpc.mockResolvedValue({ data: { rows: [], total: 0 }, error: null });
  const screen = await render(
    <MemoryRouter initialEntries={["/production?order=order-7"]}>
      <CoreAdminContext dataProvider={provider}>
        <FulfillmentList kind="production" />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await expect.element(screen.getByText("第 1 页 · 共 0 个订单")).toBeVisible();
  rpc.mockClear();
  await screen.getByRole("searchbox", { name: "搜索生产管理" }).fill("widget");
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(rpc).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "搜索", exact: true }).click();
  await expect.poll(() => rpc.mock.calls.length).toBe(1);
  expect(rpc).toHaveBeenCalledWith("romiku_list_production_order_groups", {
    p_search: "widget",
    p_view: "all",
    p_page: 1,
    p_page_size: 25,
    p_order_id: "order-7",
  });
});

it.each([
  {
    label: "PI",
    resource: "romiku_pi_totals",
    type: "pi",
    component: <DocumentList kind="pi" />,
  },
  {
    label: "订单",
    resource: "romiku_order_totals",
    type: "order",
    component: <DocumentList kind="order" />,
  },
  {
    label: "装箱与发运",
    resource: "romiku_packing_lists",
    type: "packing",
    component: <FulfillmentList kind="packing" />,
  },
])(
  "submits $label text only by button and clears to the default list",
  async ({ label, resource, type, component }) => {
    const provider = fakeRestDataProvider({
      [resource]: [{ id: "base", document_number: "BASE", status: "draft" }],
      romiku_orders: [],
    });
    rpc.mockResolvedValue({
      data: {
        groups: [
          {
            resource_type: type,
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
      <MemoryRouter>
        <CoreAdminContext dataProvider={provider}>{component}</CoreAdminContext>
      </MemoryRouter>,
    );
    const input = screen.getByRole("searchbox", { name: `搜索${label}` });
    await input.fill("BQV10");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(rpc).not.toHaveBeenCalled();
    await screen.getByRole("button", { name: "搜索", exact: true }).click();
    await expect.poll(() => rpc.mock.calls.length).toBe(1);
    expect(rpc.mock.calls[0][1]).toMatchObject({
      query: "BQV10",
      resource_types: [type],
      offset: 0,
    });
    await screen.getByRole("button", { name: "清空", exact: true }).click();
    await expect.element(input).toHaveValue("");
    await expect.element(screen.getByText("BASE")).toBeVisible();
  },
);

it("keeps old quote rows during explicit searches and ignores a late older result", async () => {
  const releases = new Map<string, (value: unknown) => void>();
  const provider = fakeRestDataProvider({
    romiku_quote_totals: [
      { id: "base", document_number: "BASE", status: "draft" },
      { id: "a", document_number: "A", status: "draft" },
      { id: "b", document_number: "B", status: "draft" },
    ],
  });
  rpc.mockImplementation(async (name, args) => {
    if (name !== "romiku_global_search") return { data: null, error: null };
    return await new Promise((resolve) => releases.set(args.query, resolve));
  });
  const screen = await render(
    <MemoryRouter>
      <CoreAdminContext dataProvider={provider}>
        <QuoteList />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await expect
    .element(screen.getByRole("link", { name: "BASE" }))
    .toBeVisible();
  const input = screen.getByRole("searchbox", { name: "搜索报价单" });
  await input.fill("A");
  await input.click();
  await userEvent.keyboard("{Enter}");
  await expect.poll(() => rpc.mock.calls.length).toBe(1);
  await expect
    .element(screen.getByRole("link", { name: "BASE" }))
    .toBeVisible();
  await expect.element(screen.getByRole("status")).toHaveTextContent("搜索中");
  await input.fill("B");
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(rpc).toHaveBeenCalledTimes(1);
  await input.click();
  await userEvent.keyboard("{Enter}");
  await expect.poll(() => rpc.mock.calls.length).toBe(2);
  releases.get("B")?.({
    data: {
      groups: [
        {
          resource_type: "quote",
          total_count: 1,
          limit: 25,
          offset: 0,
          has_more: false,
          items: [item("b")],
        },
      ],
    },
    error: null,
  });
  await expect.element(screen.getByRole("link", { name: "B" })).toBeVisible();
  releases.get("A")?.({
    data: {
      groups: [
        {
          resource_type: "quote",
          total_count: 1,
          limit: 25,
          offset: 0,
          has_more: false,
          items: [item("a")],
        },
      ],
    },
    error: null,
  });
  await expect.element(screen.getByRole("link", { name: "B" })).toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: "A" }))
    .not.toBeInTheDocument();
});

it("keeps prior quote rows on failure and retries committed text, not draft input", async () => {
  const provider = fakeRestDataProvider({
    romiku_quote_totals: [
      { id: "base", document_number: "BASE", status: "draft" },
    ],
  });
  rpc.mockImplementation(async (name) => {
    if (name !== "romiku_global_search") return { data: null, error: null };
    throw new Error("offline");
  });
  const screen = await render(
    <MemoryRouter>
      <CoreAdminContext
        dataProvider={provider}
        queryClient={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <QuoteList />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await expect
    .element(screen.getByRole("link", { name: "BASE" }))
    .toBeVisible();
  const input = screen.getByRole("searchbox", { name: "搜索报价单" });
  await input.fill("SUN");
  await input.click();
  await userEvent.keyboard("{Enter}");
  await input.fill("SUN5");
  await expect.element(screen.getByText("搜索失败。")).toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: "BASE" }))
    .toBeVisible();
  const before = rpc.mock.calls.filter(
    (call) => call[0] === "romiku_global_search",
  ).length;
  await screen.getByRole("button", { name: "重试" }).click();
  await expect
    .poll(
      () =>
        rpc.mock.calls.filter((call) => call[0] === "romiku_global_search")
          .length,
    )
    .toBe(before + 1);
  const searches = rpc.mock.calls.filter(
    (call) => call[0] === "romiku_global_search",
  );
  expect(searches.at(-1)?.[1].query).toBe("SUN");
});
