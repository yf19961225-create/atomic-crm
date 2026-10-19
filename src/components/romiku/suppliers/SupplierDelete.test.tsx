import { beforeEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter } from "react-router";
import { SupplierList } from "./SupplierLists";
import "@/index.css";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc }),
}));

beforeEach(() => rpc.mockReset());

async function setup() {
  const provider = fakeRestDataProvider({
    romiku_suppliers: [
      { id: "supplier-1", name: "QA 供应商", status: "active" },
    ],
  });
  const screen = await render(
    <MemoryRouter initialEntries={["/suppliers"]}>
      <CoreAdminContext dataProvider={provider}>
        <SupplierList />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  return { screen, provider };
}

it("requires confirmation before deleting and refreshes the list after RPC success", async () => {
  const { screen, provider } = await setup();
  await expect.element(screen.getByText("QA 供应商")).toBeVisible();
  await screen.getByRole("button", { name: "删除供应商 QA 供应商" }).click();
  await expect.element(screen.getByRole("dialog")).toBeVisible();
  expect(rpc).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "取消" }).click();
  expect(rpc).not.toHaveBeenCalled();
  rpc.mockImplementation(async (name) => {
    if (name === "romiku_delete_supplier")
      await provider.delete("romiku_suppliers", { id: "supplier-1" });
    return { data: { ok: true }, error: null };
  });
  await screen.getByRole("button", { name: "删除供应商 QA 供应商" }).click();
  await screen.getByRole("button", { name: "确认删除" }).click();
  expect(rpc).toHaveBeenCalledWith("romiku_delete_supplier", {
    record_id: "supplier-1",
  });
  await expect.element(screen.getByText("QA 供应商")).not.toBeInTheDocument();
});

it("shows server dependency counts and leaves the supplier in the list", async () => {
  const { screen } = await setup();
  rpc.mockResolvedValue({
    data: {
      ok: false,
      code: "HAS_DOWNSTREAM",
      message: "该供应商已关联 3 个产品、1 张生产单、2 个联系人，无法删除。",
      dependencies: {
        products: 3,
        production_orders: 1,
        contacts: 2,
        manual_tasks: 0,
      },
    },
    error: null,
  });
  await screen.getByRole("button", { name: "删除供应商 QA 供应商" }).click();
  await screen.getByRole("button", { name: "确认删除" }).click();
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent(
      "该供应商已关联 3 个产品、1 张生产单、2 个联系人，无法删除。",
    );
  await screen.getByRole("button", { name: "取消" }).click();
  await expect
    .element(screen.getByRole("cell", { name: "QA 供应商", exact: true }))
    .toBeVisible();
});
