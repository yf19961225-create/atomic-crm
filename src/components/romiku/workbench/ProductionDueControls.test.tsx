import { expect, it, vi, beforeEach } from "vitest";
import { render } from "vitest-browser-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductionDueControls } from "./ProductionDueControls";
import type { DueSnapshot } from "./workbenchApi";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc }),
}));
const initial = {
  id: "p",
  document_number: "PO-QA",
  factory_due_at: "2026-11-10T15:59:59.999Z",
  classification: "confirmed",
  revision: 2,
  needs_follow_up: false,
  next_follow_up_on: null,
};
beforeEach(() => {
  rpc.mockReset();
});
async function setup(classification = "confirmed") {
  let snapshot: DueSnapshot = { ...initial, classification };
  rpc.mockImplementation(async (name, args) => {
    if (name === "romiku_workbench_due_snapshot")
      return { data: snapshot, error: null };
    snapshot = {
      ...snapshot,
      revision: snapshot.revision + 1,
      factory_due_at:
        args.p_payload.date_mode === "clear"
          ? null
          : `${args.p_payload.date}T15:59:59.999Z`,
      classification: args.p_payload.classification,
    };
    return { data: { ok: true }, error: null };
  });
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const screen = await render(
    <QueryClientProvider client={cache}>
      <ProductionDueControls productionId="p" />
    </QueryClientProvider>,
  );
  await expect
    .element(screen.getByLabelText("工厂交货日期", { exact: true }))
    .toHaveValue("2026-11-10");
  return { screen, cache };
}
it("saves a date directly through revision-checked RPC with standard reason", async () => {
  const { screen } = await setup();
  await screen
    .getByLabelText("工厂交货日期", { exact: true })
    .fill("2026-12-01");
  await expect
    .element(screen.getByText("未保存", { exact: true }))
    .toBeVisible();
  await screen.getByRole("button", { name: "保存日期", exact: true }).click();
  expect(rpc).toHaveBeenCalledWith(
    "romiku_workbench_action",
    expect.objectContaining({
      p_revision: 2,
      p_reason: "调整工厂交期",
      p_payload: expect.objectContaining({
        date: "2026-12-01",
        date_mode: "set",
        classification: "confirmed",
      }),
    }),
  );
  await expect
    .element(screen.getByText("日期已保存", { exact: true }))
    .toBeVisible();
});
it("retains dirty date after realtime refresh and stale save; explicit refresh keeps input", async () => {
  const { screen, cache } = await setup();
  await screen
    .getByLabelText("工厂交货日期", { exact: true })
    .fill("2026-12-02");
  rpc.mockImplementation(async (name) =>
    name === "romiku_workbench_due_snapshot"
      ? {
          data: {
            ...initial,
            revision: 9,
            factory_due_at: "2026-11-15T15:59:59.999Z",
          },
          error: null,
        }
      : { data: null, error: { code: "PT409", message: "STALE_REVISION" } },
  );
  await cache.invalidateQueries();
  await screen.getByRole("button", { name: "保存日期", exact: true }).click();
  expect(
    rpc.mock.calls.filter(([n]) => n === "romiku_workbench_action").at(-1)?.[1]
      .p_revision,
  ).toBe(2);
  await expect.element(screen.getByRole("alert")).toHaveTextContent("已被修改");
  await expect
    .element(screen.getByLabelText("工厂交货日期", { exact: true }))
    .toHaveValue("2026-12-02");
  await screen
    .getByRole("button", { name: "读取最新版本，保留输入", exact: true })
    .click();
  await expect
    .element(screen.getByLabelText("工厂交货日期", { exact: true }))
    .toHaveValue("2026-12-02");
  await screen.getByRole("button", { name: "保存日期", exact: true }).click();
  expect(
    rpc.mock.calls.filter(([n]) => n === "romiku_workbench_action").at(-1)?.[1]
      .p_revision,
  ).toBe(9);
});
it("requires explicit confirmation to replace not-required and clear saved date", async () => {
  const { screen } = await setup("not_required");
  await screen
    .getByLabelText("工厂交货日期", { exact: true })
    .fill("2026-12-03");
  await screen.getByRole("button", { name: "保存日期", exact: true }).click();
  expect(rpc.mock.calls.some(([n]) => n === "romiku_workbench_action")).toBe(
    false,
  );
  await screen
    .getByRole("button", { name: "确认设置交期", exact: true })
    .click();
  await expect
    .element(screen.getByText("日期已保存", { exact: true }))
    .toBeVisible();
  await screen.getByText("更多设置", { exact: true }).click();
  await screen
    .getByRole("button", { name: "清除已保存日期", exact: true })
    .click();
  await screen
    .getByRole("button", { name: "确认清除日期", exact: true })
    .click();
  await expect
    .poll(
      () =>
        rpc.mock.calls
          .filter(([n]) => n === "romiku_workbench_action")
          .at(-1)?.[1].p_payload.date_mode,
    )
    .toBe("clear");
});

it("retains failed draft and reuses request ID after uncertain failure without duplicate clicks", async () => {
  const { screen } = await setup();
  let finish: (value: unknown) => void = () => {};
  rpc.mockImplementation(async (name) =>
    name === "romiku_workbench_due_snapshot"
      ? { data: initial, error: null }
      : new Promise((resolve) => {
          finish = resolve;
        }),
  );
  await screen
    .getByLabelText("工厂交货日期", { exact: true })
    .fill("2026-12-05");
  const button = screen
    .getByRole("button", { name: "保存日期", exact: true })
    .element() as HTMLButtonElement;
  button.click();
  button.click();
  await expect
    .poll(
      () =>
        rpc.mock.calls.filter(([n]) => n === "romiku_workbench_action").length,
    )
    .toBe(1);
  const id = rpc.mock.calls.find(([n]) => n === "romiku_workbench_action")![1]
    .p_request;
  finish({ data: null, error: { message: "QA network unavailable" } });
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("QA network unavailable");
  await expect
    .element(screen.getByLabelText("工厂交货日期", { exact: true }))
    .toHaveValue("2026-12-05");
  rpc.mockResolvedValueOnce({
    data: null,
    error: { message: "QA network unavailable" },
  });
  await screen.getByRole("button", { name: "保存日期", exact: true }).click();
  expect(
    rpc.mock.calls.filter(([n]) => n === "romiku_workbench_action").at(-1)?.[1]
      .p_request,
  ).toBe(id);
});
