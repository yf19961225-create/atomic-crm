import { afterEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { InquiryPage } from "./InquiryPage";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc }),
}));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const row = (id: number) => ({
  id: String(id),
  document_number: `WI-${id}`,
  customer_name: "Buyer",
  company: "QA",
  status: "pending_screening",
  submitted_at: `2026-10-11T0${id}:00:00Z`,
});
async function setup() {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const visibility = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("visible");
  const provider = fakeRestDataProvider({
    sales: [],
    romiku_website_inquiry_followups: [],
    romiku_website_inquiries: [row(1), row(2), row(3)],
  });
  const requests = vi.spyOn(provider, "getList");
  const cache = new QueryClient();
  const screen = await render(
    <MemoryRouter>
      <CoreAdminContext dataProvider={provider} queryClient={cache}>
        <InquiryPage />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await expect
    .element(screen.getByText("第 1 页 · 共 3 条记录", { exact: true }))
    .toBeVisible();
  return { screen, provider, requests, visibility, cache };
}
it("refreshes rows and total together within 30 seconds without opening a detail", async () => {
  const { screen, provider } = await setup();
  await provider.create("romiku_website_inquiries", { data: row(4) });
  await vi.advanceTimersByTimeAsync(30000);
  await expect
    .element(screen.getByText("第 1 页 · 共 4 条记录", { exact: true }))
    .toBeVisible();
  expect(document.querySelector("tbody tr")?.textContent).toContain("WI-4");
  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
});
it("does not poll hidden tabs and refreshes immediately on visibility or window focus", async () => {
  const { screen, provider, requests, visibility } = await setup();
  visibility.mockReturnValue("hidden");
  document.dispatchEvent(new Event("visibilitychange"));
  requests.mockClear();
  await provider.create("romiku_website_inquiries", { data: row(4) });
  await vi.advanceTimersByTimeAsync(90000);
  expect(requests).not.toHaveBeenCalled();
  visibility.mockReturnValue("visible");
  document.dispatchEvent(new Event("visibilitychange"));
  await expect
    .element(screen.getByText("第 1 页 · 共 4 条记录", { exact: true }))
    .toBeVisible();
  await provider.create("romiku_website_inquiries", { data: row(5) });
  window.dispatchEvent(new Event("focus"));
  await expect
    .element(screen.getByText("第 1 页 · 共 5 条记录", { exact: true }))
    .toBeVisible();
});
it("preserves status filters during refresh and offers manual refresh", async () => {
  const { screen, provider } = await setup();
  await screen.getByRole("combobox", { name: "筛选状态" }).selectOptions("won");
  await expect
    .element(screen.getByText("第 1 页 · 共 0 条记录", { exact: true }))
    .toBeVisible();
  await provider.create("romiku_website_inquiries", { data: row(4) });
  await vi.advanceTimersByTimeAsync(30000);
  await expect
    .element(screen.getByRole("combobox", { name: "筛选状态" }))
    .toHaveValue("won");
  await expect
    .element(screen.getByText("第 1 页 · 共 0 条记录", { exact: true }))
    .toBeVisible();
  await screen
    .getByRole("combobox", { name: "筛选状态" })
    .selectOptions("pending_screening");
  await expect
    .element(screen.getByText("第 1 页 · 共 4 条记录", { exact: true }))
    .toBeVisible();
  await provider.create("romiku_website_inquiries", { data: row(5) });
  await screen.getByRole("button", { name: "刷新", exact: true }).click();
  await expect
    .element(screen.getByText("第 1 页 · 共 5 条记录", { exact: true }))
    .toBeVisible();
});
it("refreshes server search and its count while retaining search and status", async () => {
  const { screen, provider } = await setup();
  rpc.mockClear();
  let ids = ["3", "2", "1"];
  rpc.mockImplementation(async () => ({
    data: {
      groups: [
        {
          resource_type: "website_inquiry",
          total_count: ids.length,
          limit: 25,
          offset: 0,
          has_more: false,
          items: ids.map((id) => ({
            id,
            title: id,
            subtitle: "",
            matched_fields: [],
            rank: 0,
          })),
        },
      ],
    },
    error: null,
  }));
  await screen
    .getByRole("combobox", { name: "筛选状态" })
    .selectOptions("pending_screening");
  await screen
    .getByRole("searchbox", { name: "搜索", exact: true })
    .fill("Buyer");
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(rpc).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "搜索", exact: true }).click();
  await expect.poll(() => rpc.mock.calls.length).toBeGreaterThan(0);
  await expect
    .element(screen.getByText("第 1 页 · 共 3 条记录", { exact: true }))
    .toBeVisible();
  await provider.create("romiku_website_inquiries", { data: row(4) });
  ids = ["4", "3", "2", "1"];
  await screen
    .getByRole("searchbox", { name: "搜索", exact: true })
    .fill("Buyer 4");
  await vi.advanceTimersByTimeAsync(30000);
  await expect
    .element(screen.getByText("第 1 页 · 共 4 条记录", { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("searchbox", { name: "搜索", exact: true }))
    .toHaveValue("Buyer 4");
  expect(document.querySelector("tbody tr")?.textContent).toContain("WI-4");
  expect(rpc).toHaveBeenLastCalledWith(
    "romiku_global_search",
    expect.objectContaining({
      query: "Buyer",
      filters: { status: "pending_screening" },
      offset: 0,
    }),
  );
});
it("retains rows/count and last successful time on failure, then recovers", async () => {
  const { screen, requests } = await setup();
  await expect.element(screen.getByText(/最后刷新：\d/)).toBeVisible();
  const last = document.querySelector("time")?.getAttribute("datetime");
  const original = requests.getMockImplementation()!;
  requests.mockImplementation((resource, params) =>
    resource === "romiku_website_inquiries"
      ? Promise.reject(new Error("offline"))
      : original(resource, params),
  );
  await screen.getByRole("button", { name: "刷新", exact: true }).click();
  await expect
    .element(screen.getByText("刷新失败，当前显示上次成功的数据。"))
    .toBeVisible();
  expect(document.querySelector("time")?.getAttribute("datetime")).toBe(last);
  await expect
    .element(screen.getByText("第 1 页 · 共 3 条记录", { exact: true }))
    .toBeVisible();
  requests.mockImplementation(original);
  await screen.getByRole("button", { name: "重试", exact: true }).click();
  await expect
    .element(screen.getByText("刷新失败，当前显示上次成功的数据。"))
    .not.toBeInTheDocument();
  await expect
    .poll(() => document.querySelector("time")?.getAttribute("datetime"))
    .not.toBe(last);
});
it("alerts about a new inquiry hidden by a status filter without changing the filter", async () => {
  const { screen, provider } = await setup();
  await screen.getByRole("combobox", { name: "筛选状态" }).selectOptions("won");
  await provider.create("romiku_website_inquiries", { data: row(4) });
  await vi.advanceTimersByTimeAsync(30000);
  await expect.element(screen.getByText("有 1 条新询盘")).toBeVisible();
  await expect
    .element(screen.getByRole("combobox", { name: "筛选状态" }))
    .toHaveValue("won");
  await screen.getByRole("button", { name: "查看最新" }).click();
  await expect
    .element(screen.getByText("第 1 页 · 共 4 条记录", { exact: true }))
    .toBeVisible();
});

it("detects arrivals on page two without moving the page until requested", async () => {
  const { screen, provider } = await setup();
  await screen
    .getByRole("combobox", { name: "筛选状态" })
    .selectOptions("pending_screening");
  for (let n = 4; n <= 27; n++)
    await provider.create("romiku_website_inquiries", {
      data: {
        ...row(n),
        submitted_at: new Date(Date.UTC(2026, 9, 11, 0, n)).toISOString(),
      },
    });
  await screen.getByRole("button", { name: "刷新", exact: true }).click();
  await expect
    .element(screen.getByText("第 1 页 · 共 27 条记录", { exact: true }))
    .toBeVisible();
  await screen.getByRole("button", { name: "下一页", exact: true }).click();
  await expect
    .element(screen.getByText("第 2 页 · 共 27 条记录", { exact: true }))
    .toBeVisible();
  await provider.create("romiku_website_inquiries", {
    data: { ...row(28), submitted_at: "2026-10-12T00:00:00Z" },
  });
  await vi.advanceTimersByTimeAsync(30000);
  await expect.element(screen.getByText("有 1 条新询盘")).toBeVisible();
  await expect
    .element(screen.getByText("第 2 页 · 共 28 条记录", { exact: true }))
    .toBeVisible();
  await screen.getByRole("button", { name: "查看最新" }).click();
  await expect
    .element(screen.getByText("第 1 页 · 共 28 条记录", { exact: true }))
    .toBeVisible();
  expect(document.querySelector("tbody tr")?.textContent).toContain("WI-28");
  await expect
    .element(screen.getByRole("combobox", { name: "筛选状态" }))
    .toHaveValue("pending_screening");
});

it("does not advance last refresh for local cache writes", async () => {
  const { screen, cache } = await setup();
  await expect.element(screen.getByText(/最后刷新：\d/)).toBeVisible();
  const last = document.querySelector("time")?.getAttribute("datetime");
  cache.setQueriesData(
    { predicate: (q) => q.queryKey[0] === "romiku_website_inquiries" },
    (old) => old,
    { updatedAt: Date.now() + 60000 },
  );
  expect(document.querySelector("time")?.getAttribute("datetime")).toBe(last);
});
