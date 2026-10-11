import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { CustomerActions } from "./CustomerActions";
import "@/index.css";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc }),
}));
beforeEach(() => rpc.mockReset());
const setup = async (bulk = false) =>
  render(
    <CoreAdminContext dataProvider={fakeRestDataProvider({})}>
      <CustomerActions
        ids={bulk ? ["a", "b", "c"] : ["a"]}
        record={bulk ? undefined : { id: "a", name: "Buyer", status: "active" }}
        onDone={vi.fn()}
        onView={vi.fn()}
        onEdit={vi.fn()}
      />
    </CoreAdminContext>,
  );
it("blocks customer hard delete and offers disable without a delete confirmation", async () => {
  rpc.mockResolvedValue({
    data: {
      ok: true,
      deletable: [],
      blocked: [
        {
          id: "a",
          label: "Buyer",
          dependencies: { orders: 2 },
          reasons: ["已有业务历史"],
        },
      ],
    },
  });
  const s = await setup();
  await s.getByRole("button", { name: "客户操作 Buyer" }).click();
  await s.getByRole("menuitem", { name: "删除", exact: true }).click();
  await expect.element(s.getByText("订单：2", { exact: true })).toBeVisible();
  await expect
    .element(s.getByRole("button", { name: "永久删除客户" }))
    .not.toBeInTheDocument();
  await s.getByRole("button", { name: "停用客户", exact: true }).click();
  rpc.mockResolvedValueOnce({
    data: { ok: true, succeeded: [{ id: "a", label: "Buyer" }], failed: [] },
  });
  await s.getByRole("button", { name: "确认停用" }).click();
  expect(rpc).toHaveBeenLastCalledWith("romiku_batch_status", {
    kind: "formal_customer",
    ids: ["a"],
    target_status: "inactive",
  });
});
it("only submits eligible IDs from a mixed batch", async () => {
  rpc.mockResolvedValueOnce({
    data: {
      ok: true,
      deletable: [
        { id: "a", label: "A" },
        { id: "c", label: "C" },
      ],
      blocked: [
        {
          id: "b",
          label: "B",
          dependencies: { orders: 1 },
          reasons: ["已有订单"],
        },
      ],
    },
  });
  const s = await setup(true);
  await s.getByRole("button", { name: "批量删除" }).click();
  await expect.element(s.getByText("订单：1", { exact: true })).toBeVisible();
  rpc.mockResolvedValueOnce({
    data: {
      ok: true,
      succeeded: [
        { id: "a", label: "A" },
        { id: "c", label: "C" },
      ],
      failed: [],
    },
  });
  await s.getByRole("button", { name: "删除 2 个可删除客户" }).click();
  expect(rpc).toHaveBeenLastCalledWith("romiku_batch_delete", {
    kind: "formal_customer",
    ids: ["a", "c"],
  });
  await expect.element(s.getByText("成功 2 个，失败 0 个")).toBeVisible();
});
it("cancel does not execute deletion", async () => {
  rpc.mockResolvedValue({
    data: { ok: true, deletable: [{ id: "a", label: "Buyer" }], blocked: [] },
  });
  const s = await setup();
  await s.getByRole("button", { name: "客户操作 Buyer" }).click();
  await s.getByRole("menuitem", { name: "删除", exact: true }).click();
  await s.getByRole("button", { name: "取消", exact: true }).click();
  expect(
    rpc.mock.calls.every(([name]) => name === "romiku_delete_preflight"),
  ).toBe(true);
});
it.each([
  ["批量启用", "确认启用", "active"],
  ["批量停用", "确认停用", "inactive"],
])(
  "%s submits the fixed status and reports partial failures",
  async (label, confirm, status) => {
    rpc.mockResolvedValue({
      data: {
        ok: true,
        succeeded: [
          { id: "a", label: "A" },
          { id: "c", label: "C" },
        ],
        failed: [{ id: "b", label: "B", message: "记录不存在或无权操作。" }],
      },
    });
    const s = await setup(true);
    await s.getByRole("button", { name: label, exact: true }).click();
    await s.getByRole("button", { name: confirm, exact: true }).click();
    expect(rpc).toHaveBeenCalledWith("romiku_batch_status", {
      kind: "formal_customer",
      ids: ["a", "b", "c"],
      target_status: status,
    });
    await expect.element(s.getByText("成功 2 个，失败 1 个")).toBeVisible();
    await expect
      .element(s.getByRole("alert"))
      .toHaveTextContent("B：记录不存在或无权操作。");
  },
);
