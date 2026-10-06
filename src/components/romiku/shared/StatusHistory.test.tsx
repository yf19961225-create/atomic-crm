import { QueryClient } from "@tanstack/react-query";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { afterEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { StatusHistoryPanel } from "./StatusHistoryPanel";
import { StatusAge, statusDuration } from "./StatusAge";
import { InlineStatusSelect } from "./InlineStatusSelect";
import { BulkActions } from "./BulkActions";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc }),
}));
afterEach(() => {
  vi.restoreAllMocks();
  rpc.mockReset();
});
const initial = {
  id: "h1",
  changed_at: "2026-10-06T01:00:00Z",
  from_status: null,
  to_status: "pending_quote",
  changed_by: null,
  changed_by_name: null,
  change_source: "migration",
};
const manual = {
  id: "h2",
  changed_at: "2026-10-06T02:00:00Z",
  from_status: "pending_quote",
  to_status: "quoted",
  changed_by: "secret-user-id",
  changed_by_name: "Nana",
  change_source: "manual",
};
function context(
  children: React.ReactNode,
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) {
  return (
    <CoreAdminContext
      queryClient={queryClient}
      dataProvider={fakeRestDataProvider({})}
    >
      {children}
    </CoreAdminContext>
  );
}
it("formats elapsed state time without treating invalid dates as real history", () => {
  const now = Date.parse("2026-10-06T12:00:00Z");
  for (const [minutes, label] of [
    [0, "刚刚"],
    [32, "32分钟"],
    [300, "5小时"],
    [4320, "3天"],
  ] as const)
    expect(
      statusDuration(new Date(now - minutes * 60000).toISOString(), now),
    ).toBe(label);
  expect(statusDuration(null, now)).toBe("—");
  expect(statusDuration("bad", now)).toBe("—");
  expect(statusDuration(new Date(now + 1000).toISOString(), now)).toBe("刚刚");
});
it("starts collapsed, pages 20 server-side, renders migration and actor names without UUIDs", async () => {
  rpc
    .mockResolvedValueOnce({
      data: {
        records: [manual, initial],
        has_more: true,
        next_cursor: { changed_at: initial.changed_at, id: initial.id },
      },
      error: null,
    })
    .mockResolvedValueOnce({
      data: {
        records: [{ ...initial, id: "older" }],
        has_more: false,
        next_cursor: null,
      },
      error: null,
    });
  const s = await render(
    context(<StatusHistoryPanel resourceType="quote" resourceId="q1" />),
  );
  expect(rpc).not.toHaveBeenCalled();
  await s.getByText("状态记录", { exact: true }).click();
  await expect
    .element(s.getByText("待报价 → 已报价", { exact: true }))
    .toBeVisible();
  await expect
    .element(s.getByText("系统初始化状态记录 · 待报价", { exact: true }))
    .toBeVisible();
  await expect.element(s.getByText("Nana", { exact: true })).toBeVisible();
  expect(document.body.textContent).not.toContain("secret-user-id");
  expect(rpc).toHaveBeenCalledWith("romiku_get_status_history", {
    resource_type: "quote",
    resource_id: "q1",
    page_size: 20,
    before_changed_at: null,
    before_id: null,
  });
  await s.getByRole("button", { name: "加载更多" }).click();
  await expect.poll(() => rpc.mock.calls.length).toBe(2);
  expect(rpc.mock.calls[1][1]).toMatchObject({
    before_changed_at: initial.changed_at,
    before_id: "h1",
  });
  await expect
    .element(s.getByRole("button", { name: "加载更多" }))
    .not.toBeInTheDocument();
});
it("uses resource-specific labels and generic readable fallback when actor cannot be resolved", async () => {
  rpc.mockResolvedValue({
    data: {
      records: [
        {
          ...manual,
          from_status: "draft",
          to_status: "sent",
          changed_by_name: null,
        },
      ],
      has_more: false,
    },
    error: null,
  });
  const s = await render(
    context(<StatusHistoryPanel resourceType="pi" resourceId="pi1" />),
  );
  await s.getByText("状态记录", { exact: true }).click();
  await expect
    .element(s.getByText("待制作 → 已发送", { exact: true }))
    .toBeVisible();
  await expect
    .element(s.getByText("已登录用户", { exact: true }))
    .toBeVisible();
});
it("refreshes open history after a single status mutation and resets displayed duration", async () => {
  const provider = fakeRestDataProvider({
    romiku_quotes: [{ id: "q", status: "pending_quote" }],
  });
  vi.spyOn(provider, "update").mockImplementation(async () => ({
    data: {
      id: "q",
      status: "quoted",
      status_changed_at: new Date().toISOString(),
    },
  }));
  const cache = new QueryClient();
  rpc
    .mockResolvedValueOnce({
      data: { records: [initial], has_more: false },
      error: null,
    })
    .mockResolvedValue({
      data: { records: [manual, initial], has_more: false },
      error: null,
    });
  const s = await render(
    <CoreAdminContext dataProvider={provider} queryClient={cache}>
      <InlineStatusSelect
        resource="romiku_quotes"
        recordId="q"
        status="pending_quote"
        statusChangedAt="2026-01-01T00:00:00Z"
        showAge
        choices={[
          { value: "pending_quote", label: "待报价" },
          { value: "quoted", label: "已报价" },
        ]}
      />
      <StatusHistoryPanel resourceType="quote" resourceId="q" />
    </CoreAdminContext>,
  );
  await s.getByText("状态记录", { exact: true }).click();
  await expect
    .element(s.getByText("系统初始化状态记录 · 待报价", { exact: true }))
    .toBeVisible();
  await s.getByLabelText("状态 q", { exact: true }).selectOptions("quoted");
  await expect
    .element(s.getByText("待报价 → 已报价", { exact: true }))
    .toBeVisible();
  await expect.element(s.getByText("刚刚", { exact: true })).toBeVisible();
});
it("shows errors with retry and no invented history", async () => {
  rpc
    .mockResolvedValueOnce({ data: null, error: { message: "failure" } })
    .mockResolvedValue({ data: { records: [], has_more: false }, error: null });
  const s = await render(
    context(
      <StatusHistoryPanel resourceType="website_inquiry" resourceId="i" />,
    ),
  );
  await s.getByText("状态记录", { exact: true }).click();
  await expect
    .element(s.getByRole("alert"))
    .toHaveTextContent("状态记录加载失败");
  await s.getByRole("button", { name: "重试" }).click();
  await expect
    .element(s.getByText("暂无状态记录", { exact: true }))
    .toBeVisible();
});
it("renders Shanghai timestamp and updates age when server timestamp changes", async () => {
  const s = await render(<StatusAge changedAt="2026-10-06T01:00:00Z" />);
  await expect
    .element(s.getByLabelText("当前状态持续时间"))
    .toHaveAttribute("title", expect.stringContaining("2026/10/06 09:00"));
  await s.rerender(<StatusAge changedAt={new Date().toISOString()} />);
  await expect.element(s.getByText("刚刚", { exact: true })).toBeVisible();
});
it("batch success refreshes status history cache", async () => {
  const cache = new QueryClient();
  const key = ["romiku-status-history", "website_inquiry", "i"];
  cache.setQueryData(key, { records: [] });
  rpc.mockResolvedValue({
    data: { ok: true, succeeded: [{ id: "i" }], failed: [] },
    error: null,
  });
  const s = await render(
    context(
      <BulkActions kind="website_inquiry" ids={["i"]} onDone={() => {}} />,
      cache,
    ),
  );
  await s.getByRole("button", { name: "批量修改状态", exact: true }).click();
  await s.getByLabelText("目标状态").selectOptions("pending_contact");
  await s.getByRole("button", { name: "确认修改", exact: true }).click();
  await expect.poll(() => cache.getQueryState(key)?.isInvalidated).toBe(true);
});
