import { RomikuWorkbench } from "../workbench/RomikuWorkbench";
import { actionResources } from "../workbench/actions";
import { expect, it, vi, beforeEach } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter, Route, Routes } from "react-router";
import { romikuRoutes } from "../routes/RomikuRoutes";
import "@/index.css";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc }),
}));
beforeEach(() => {
  rpc.mockReset();
});
const cases = [
  ["quote", "/quotes", "romiku_quote_totals"],
  ["pi", "/pi", "romiku_pi_totals"],
  ["order", "/orders", "romiku_order_totals"],
  ["packing", "/packing-shipping", "romiku_packing_lists"],
  ["outbound", "/outbound-development", "romiku_outbound_companies"],
] as const;
async function setup(path: string, resource: string, count = 1) {
  const provider = fakeRestDataProvider({
    [resource]: Array.from({ length: count }, (_, i) => ({
      id: String(i + 1),
      document_number: `DELETE-${i + 1}`,
      name: `DELETE-${i + 1}`,
      status: "draft",
      currency: "USD",
      total: 0,
      created_at: String(i).padStart(3, "0"),
    })),
    sales: [],
    romiku_outbound_contacts: [],
    romiku_outbound_followups: [],
  });
  const screen = await render(
    <MemoryRouter initialEntries={[path]}>
      <CoreAdminContext dataProvider={provider}>
        <Routes>{romikuRoutes}</Routes>
      </CoreAdminContext>
    </MemoryRouter>,
  );
  return { screen, provider };
}
for (const [kind, path, resource] of cases) {
  it(`${kind}: confirms before RPC and refreshes list/count after success`, async () => {
    const { screen, provider } = await setup(path, resource);
    rpc.mockImplementation(async (name, args) => {
      expect(name).toBe("romiku_delete_record");
      expect(args).toEqual({ kind, record_id: "1" });
      await provider.delete(resource, { id: "1" });
      return { data: { ok: true }, error: null };
    });
    await screen.getByRole("button", { name: "更多操作 DELETE-1" }).click();
    await screen.getByRole("menuitem", { name: "删除", exact: true }).click();
    await expect.element(screen.getByRole("dialog")).toBeVisible();
    expect(rpc).not.toHaveBeenCalled();
    await screen.getByRole("button", { name: "取消", exact: true }).click();
    expect(rpc).not.toHaveBeenCalled();
    await screen.getByRole("button", { name: "更多操作 DELETE-1" }).click();
    await screen.getByRole("menuitem", { name: "删除", exact: true }).click();
    await screen.getByRole("button", { name: "确认删除", exact: true }).click();
    await expect.element(screen.getByText(/共 0/)).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "更多操作 DELETE-1" }))
      .not.toBeInTheDocument();
  });
}
it("returns to the previous page when its last record is deleted", async () => {
  const { screen, provider } = await setup(
    "/quotes",
    "romiku_quote_totals",
    26,
  );
  rpc.mockImplementation(async (_name, args) => {
    await provider.delete("romiku_quote_totals", { id: args.record_id });
    return { data: { ok: true }, error: null };
  });
  await screen.getByRole("button", { name: "下一页" }).click();
  await screen.getByRole("button", { name: "更多操作 DELETE-1" }).click();
  await screen.getByRole("menuitem", { name: "删除", exact: true }).click();
  await screen.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect
    .element(screen.getByText("第 1 页 · 共 25 张报价单"))
    .toBeVisible();
});
for (const transport of [false, true])
  it(`keeps record and shows a safe reason (transport=${transport})`, async () => {
    const { screen } = await setup("/quotes", "romiku_quote_totals");
    rpc.mockResolvedValue(
      transport
        ? {
            data: null,
            error: { message: "violates foreign key secret_constraint" },
          }
        : {
            data: {
              ok: false,
              code: "HAS_DOWNSTREAM",
              message: "该报价单已有 1 张 PI、0 张订单，无法删除。",
              dependencies: { pi: 1, orders: 0 },
            },
            error: null,
          },
    );
    await screen.getByRole("button", { name: "更多操作 DELETE-1" }).click();
    await screen.getByRole("menuitem", { name: "删除", exact: true }).click();
    await screen.getByRole("button", { name: "确认删除", exact: true }).click();
    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent(
        transport
          ? "删除失败，请刷新后重试。"
          : "该报价单已有 1 张 PI、0 张订单，无法删除。",
      );
    await expect.element(screen.getByText(/共 1/)).toBeVisible();
  });

it("Workbench deletes only manual tasks and keeps derived sources", async () => {
  const provider = fakeRestDataProvider({
    ...Object.fromEntries(actionResources.map((resource) => [resource, []])),
    sales: [],
    romiku_quotes: [
      { id: "q", document_number: "KEEP-QUOTE", status: "draft" },
    ],
    romiku_manual_tasks: [{ id: "t", title: "DELETE-TASK", quote_id: "q" }],
  });
  rpc.mockImplementation(async (name, args) => {
    expect(name).toBe("romiku_delete_record");
    expect(args).toEqual({ kind: "manual_task", record_id: "t" });
    await provider.delete("romiku_manual_tasks", { id: "t" });
    return { data: { ok: true }, error: null };
  });
  const screen = await render(
    <MemoryRouter>
      <CoreAdminContext dataProvider={provider}>
        <RomikuWorkbench />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await expect.element(screen.getByText("2 项待办")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "更多操作 KEEP-QUOTE" }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("link", { name: "打开来源" }))
    .toHaveAttribute("href", "/quotes/q");
  await screen.getByRole("button", { name: "更多操作 DELETE-TASK" }).click();
  await screen.getByRole("menuitem", { name: "删除", exact: true }).click();
  await screen.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect.element(screen.getByText("1 项待办")).toBeVisible();
  expect(
    (await provider.getOne("romiku_quotes", { id: "q" })).data.document_number,
  ).toBe("KEEP-QUOTE");
});
for (const [kind, path, resource, items] of [
  ["quote", "/quotes", "romiku_quotes", "romiku_quote_items"],
  ["pi", "/pi", "romiku_pis", "romiku_pi_items"],
  ["order", "/orders", "romiku_orders", "romiku_order_items"],
  [
    "packing",
    "/packing-shipping",
    "romiku_packing_lists",
    "romiku_packing_items",
  ],
  ["manual_task", "/calendar/tasks", "romiku_manual_tasks", "unused_items"],
] as const)
  it(`${kind} detail deletes and returns to its list`, async () => {
    const provider = fakeRestDataProvider({
      [resource]: [
        {
          id: "x",
          document_number: "DETAIL-X",
          title: "DETAIL-X",
          status: "draft",
          currency: "USD",
          counterparty_snapshot: {},
          terms_snapshot: {},
          bank_snapshot: {},
        },
      ],
      [items]: [],
      sales: [],
      romiku_payments: [],
    });
    rpc.mockImplementation(async (name, args) => {
      expect(name).toBe("romiku_delete_record");
      expect(args).toEqual({ kind, record_id: "x" });
      await provider.delete(resource, { id: "x" });
      return { data: { ok: true }, error: null };
    });
    const screen = await render(
      <MemoryRouter initialEntries={[`${path}/x`]}>
        <CoreAdminContext dataProvider={provider}>
          <Routes>
            <Route path={path} element={<p>RETURNED-TO-LIST</p>} />
            {romikuRoutes}
          </Routes>
        </CoreAdminContext>
      </MemoryRouter>,
    );
    await screen.getByRole("button", { name: "更多操作 DETAIL-X" }).click();
    await screen.getByRole("menuitem", { name: "删除", exact: true }).click();
    await screen.getByRole("button", { name: "确认删除", exact: true }).click();
    await expect.element(screen.getByText("RETURNED-TO-LIST")).toBeVisible();
  });
