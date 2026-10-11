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
  const screen = await render(
    <MemoryRouter>
      <CoreAdminContext dataProvider={provider} queryClient={new QueryClient()}>
        <InquiryPage />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await expect
    .element(screen.getByText("第 1 页 · 共 3 条记录", { exact: true }))
    .toBeVisible();
  return { screen, provider, requests, visibility };
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
    .getByRole("textbox", { name: "搜索", exact: true })
    .fill("Buyer");
  await expect.poll(() => rpc.mock.calls.length).toBeGreaterThan(0);
  await expect
    .element(screen.getByText("第 1 页 · 共 3 条记录", { exact: true }))
    .toBeVisible();
  await provider.create("romiku_website_inquiries", { data: row(4) });
  ids = ["4", "3", "2", "1"];
  await vi.advanceTimersByTimeAsync(30000);
  await expect
    .element(screen.getByText("第 1 页 · 共 4 条记录", { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("textbox", { name: "搜索", exact: true }))
    .toHaveValue("Buyer");
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
