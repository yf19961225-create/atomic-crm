import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CollectionControls } from "./CollectionControls";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc }),
}));
it("requires a reason and submits 2913/3000 acceptance with server fingerprint without a financial write", async () => {
  rpc.mockResolvedValue({
    data: {
      amounts: {
        total: 10000,
        remaining: 7087,
        deposit_percent: 30,
        deposit_remaining: 87,
        status: "confirmed",
      },
      payments: [{ id: "p", amount: 2913 }],
      state: {
        customer_confirmation: "confirmed",
        deposit_override: "none",
        revision: 2,
      },
      fingerprint: "proof",
    },
    error: null,
  });
  const screen = await render(
    <QueryClientProvider client={new QueryClient()}>
      <CollectionControls orderId="o" />
    </QueryClientProvider>,
  );
  await screen.getByRole("button", { name: "管理收款阶段" }).click();
  await expect.element(screen.getByText("实际已收定金：2913.00")).toBeVisible();
  await screen
    .getByLabelText("操作", { exact: true })
    .selectOptions("deposit_accept");
  await expect
    .element(screen.getByRole("button", { name: "确认操作" }))
    .toBeDisabled();
  await screen.getByLabelText("操作原因").fill("核对银行到账");
  rpc.mockResolvedValueOnce({ data: { ok: true }, error: null });
  await screen.getByRole("button", { name: "确认操作" }).click();
  expect(rpc).toHaveBeenCalledWith(
    "romiku_workbench_action",
    expect.objectContaining({
      p_action: "deposit_accept",
      p_id: "o",
      p_revision: 2,
      p_payload: { fingerprint: "proof" },
      p_reason: "核对银行到账",
    }),
  );
});
it("keeps failed input and original request ID for retry, and locks duplicate clicks", async () => {
  rpc.mockReset();
  const snapshot = {
    amounts: {
      total: 10000,
      remaining: 7087,
      deposit_percent: 30,
      deposit_remaining: 87,
      status: "confirmed",
    },
    payments: [{ id: "p", amount: 2913 }],
    state: {
      customer_confirmation: "confirmed",
      deposit_override: "none",
      revision: 2,
    },
    fingerprint: "proof",
  };
  let settle: (value: unknown) => void = () => {};
  rpc.mockImplementation(async (name) =>
    name === "romiku_workbench_order_snapshot"
      ? { data: snapshot, error: null }
      : new Promise((resolve) => {
          settle = resolve;
        }),
  );
  const screen = await render(
    <QueryClientProvider client={new QueryClient()}>
      <CollectionControls orderId="o" />
    </QueryClientProvider>,
  );
  await screen.getByRole("button", { name: "管理收款阶段" }).click();
  await screen.getByLabelText("操作原因").fill("keep reason");
  const button = screen
    .getByRole("button", { name: "确认操作" })
    .element() as HTMLButtonElement;
  button.click();
  button.click();
  await expect
    .poll(
      () =>
        rpc.mock.calls.filter(([name]) => name === "romiku_workbench_action")
          .length,
    )
    .toBe(1);
  await expect
    .element(screen.getByRole("button", { name: "确认操作" }))
    .toBeDisabled();
  const original = rpc.mock.calls.find(
    ([name]) => name === "romiku_workbench_action",
  )![1].p_request;
  settle({ data: null, error: { code: "NETWORK", message: "QA unavailable" } });
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("QA unavailable");
  await expect
    .element(screen.getByLabelText("操作原因"))
    .toHaveValue("keep reason");
  rpc.mockResolvedValueOnce({ data: { ok: true }, error: null });
  await screen.getByRole("button", { name: "确认操作" }).click();
  expect(
    rpc.mock.calls
      .filter(([name]) => name === "romiku_workbench_action")
      .at(-1)![1].p_request,
  ).toBe(original);
});

it("reads a fresh revision before reopening a cached collection form", async () => {
  rpc.mockReset();
  let revision = 2;
  rpc.mockImplementation(async (name) => ({
    data:
      name === "romiku_workbench_order_snapshot"
        ? {
            amounts: {
              total: 10000,
              remaining: 7087,
              deposit_percent: 30,
              deposit_remaining: 87,
              status: "confirmed",
            },
            payments: [{ id: "p", amount: 2913 }],
            state: {
              customer_confirmation: "confirmed",
              deposit_override: "none",
              revision,
            },
            fingerprint: "proof",
          }
        : { ok: true },
    error: null,
  }));
  const screen = await render(
    <QueryClientProvider client={new QueryClient()}>
      <CollectionControls orderId="fresh" />
    </QueryClientProvider>,
  );
  await screen.getByRole("button", { name: "管理收款阶段" }).click();
  await screen.getByLabelText("操作原因").fill("first");
  await screen.getByRole("button", { name: "确认操作" }).click();
  await expect
    .element(screen.getByRole("region", { name: "收款阶段管理" }))
    .not.toBeInTheDocument();
  revision = 9;
  await screen.getByRole("button", { name: "管理收款阶段" }).click();
  await screen.getByLabelText("操作原因").fill("second");
  await screen.getByRole("button", { name: "确认操作" }).click();
  expect(
    rpc.mock.calls
      .filter(([name]) => name === "romiku_workbench_action")
      .at(-1)![1].p_revision,
  ).toBe(9);
});
