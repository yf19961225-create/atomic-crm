import { beforeEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GlobalSearch } from "./GlobalSearch";
import { searchTypes, type SearchType } from "./search";
import "@/index.css";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc }),
}));
const groups = (
  query: string,
  offset = 0,
  types: SearchType[] = [...searchTypes],
) =>
  types.map((resource_type) => ({
    resource_type,
    total_count: resource_type === "quote" ? 7 : 0,
    limit: 5,
    offset,
    has_more: resource_type === "quote" && offset === 0,
    items:
      resource_type === "quote"
        ? Array.from({ length: offset ? 2 : 5 }, (_, i) => ({
            id: `${query}-${offset + i}`,
            title: `${query}-${offset + i}`,
            subtitle: "",
            matched_fields: ["SKU"],
            rank: i,
          }))
        : [],
  }));
beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (_name, args) => ({
    data: {
      groups: groups(
        args.query,
        args.offset,
        args.resource_types || [...searchTypes],
      ),
    },
    error: null,
  }));
});
it("requests eight groups once, then loads only the selected group", async () => {
  const screen = await render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/search?q=needle"]}>
        <Routes>
          <Route path="/search" element={<GlobalSearch />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await expect
    .element(screen.getByRole("link", { name: "needle-0" }))
    .toBeVisible();
  expect(rpc).toHaveBeenCalledWith("romiku_global_search", {
    query: "needle",
    resource_types: [...searchTypes],
    limit: 5,
    offset: 0,
    filters: {},
  });
  expect(rpc).toHaveBeenCalledTimes(1);
  await screen.getByRole("button", { name: "加载更多" }).click();
  await expect
    .element(screen.getByRole("link", { name: "needle-6" }))
    .toBeVisible();
  expect(rpc).toHaveBeenLastCalledWith("romiku_global_search", {
    query: "needle",
    resource_types: ["quote"],
    limit: 5,
    offset: 5,
    filters: {},
  });
});
it("does not append old group pages after a new query", async () => {
  let release: ((value: unknown) => void) | undefined;
  rpc.mockImplementation(async (_name, args) =>
    args.offset
      ? await new Promise((resolve) => {
          release = resolve;
        })
      : { data: { groups: groups(args.query) }, error: null },
  );
  const screen = await render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/search?q=first"]}>
        <Routes>
          <Route path="/search" element={<GlobalSearch />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await expect
    .element(screen.getByRole("link", { name: "first-0" }))
    .toBeVisible();
  await screen.getByRole("button", { name: "加载更多" }).click();
  await screen.getByRole("searchbox", { name: "搜索业务记录" }).fill("second");
  await expect
    .element(screen.getByRole("link", { name: "second-0" }))
    .toBeVisible();
  release?.({ data: { groups: groups("first", 5, ["quote"]) }, error: null });
  await expect
    .element(screen.getByRole("link", { name: "first-5" }))
    .not.toBeInTheDocument();
});

it("replaces cached group items and count after search invalidation", async () => {
  const client = new QueryClient();
  let total = 7;
  rpc.mockImplementation(async (_name, args) => ({
    data: {
      groups: groups(
        args.query,
        args.offset,
        args.resource_types || [...searchTypes],
      ).map((group) =>
        group.resource_type === "quote"
          ? {
              ...group,
              total_count: total,
              has_more: total > group.items.length,
              items: total === 0 ? [] : group.items,
            }
          : group,
      ),
    },
    error: null,
  }));
  const screen = await render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/search?q=needle"]}>
        <Routes>
          <Route path="/search" element={<GlobalSearch />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await expect
    .element(screen.getByRole("link", { name: "needle-0" }))
    .toBeVisible();
  total = 0;
  await client.invalidateQueries({ queryKey: ["romiku-search"] });
  await expect
    .element(screen.getByRole("link", { name: "needle-0" }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("region", { name: "报价单" }))
    .toHaveTextContent("报价单 · 0");
});
it("uses the next page metadata and removes duplicate IDs", async () => {
  rpc.mockImplementation(async (_name, args) =>
    args.offset
      ? {
          data: {
            groups: [
              {
                resource_type: "quote",
                total_count: 6,
                limit: 5,
                offset: 5,
                has_more: false,
                items: [
                  {
                    id: "needle-4",
                    title: "needle-4",
                    subtitle: "",
                    matched_fields: [],
                    rank: 0,
                  },
                  {
                    id: "needle-5",
                    title: "needle-5",
                    subtitle: "",
                    matched_fields: [],
                    rank: 1,
                  },
                ],
              },
            ],
          },
          error: null,
        }
      : { data: { groups: groups(args.query) }, error: null },
  );
  const screen = await render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/search?q=needle"]}>
        <Routes>
          <Route path="/search" element={<GlobalSearch />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await expect
    .element(screen.getByRole("button", { name: "加载更多" }))
    .toBeVisible();
  await screen.getByRole("button", { name: "加载更多" }).click();
  await expect
    .element(screen.getByRole("link", { name: "needle-5" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("region", { name: "报价单" }))
    .toHaveTextContent("报价单 · 6");
  expect(document.querySelectorAll('a[href="/quotes/needle-4"]').length).toBe(
    1,
  );
  await expect
    .element(screen.getByRole("button", { name: "加载更多" }))
    .not.toBeInTheDocument();
});
