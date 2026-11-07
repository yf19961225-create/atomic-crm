import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { DocumentDetail } from "./DocumentPages";

vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc: async () => ({ data: [], error: null }) }),
}));
async function setup(kind: "order" | "pi", empty = false, cached = false) {
  let release!: () => void;
  let fail = false;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const resource = kind === "order" ? "romiku_orders" : "romiku_pis";
  const items = kind === "order" ? "romiku_order_items" : "romiku_pi_items";
  const provider = fakeRestDataProvider({
    [resource]: [
      {
        id: "qa",
        document_number: "QA-LOADING",
        status: "draft",
        currency: "USD",
        counterparty_snapshot: { name: "QA buyer" },
      },
    ],
    [items]: empty
      ? []
      : [
          {
            id: "line",
            [`${kind}_id`]: "qa",
            sku: "SUN5",
            quantity: 120,
            unit_price: 8,
            product_snapshot: {
              name: "QA saved product",
              specification: "48W",
            },
            packing_snapshot: { qty_per_carton: 24 },
          },
        ],
    romiku_payments: [],
    romiku_production_orders: [],
    romiku_formal_customer_directory: [],
    sales: [],
  });
  const getList = provider.getList.bind(provider);
  provider.getList = async (name, params) => {
    if (name === items) {
      await gate;
      if (fail) throw new Error("QA item load failed");
    }
    return getList(name, params);
  };
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  if (cached) cache.setQueryData([`${kind}-items`, "qa"], []);
  const screen = await render(
    <MemoryRouter initialEntries={["/document/qa"]}>
      <CoreAdminContext dataProvider={provider} queryClient={cache}>
        <Routes>
          <Route
            path="/document/:id"
            element={<DocumentDetail kind={kind} />}
          />
        </Routes>
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await expect
    .element(screen.getByRole("heading", { name: "QA-LOADING", exact: true }))
    .toBeVisible();
  return {
    screen,
    release: (error = false) => {
      fail = error;
      release();
    },
  };
}
for (const kind of ["order", "pi"] as const) {
  it.each([false, true])(
    `${kind} blocks early editing including cached empty items (%s)`,
    async (cached) => {
      const { screen, release } = await setup(kind, false, cached);
      const edit = screen.getByRole("button", { name: "编辑", exact: true });
      await expect.element(edit).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "保存", exact: true }).query(),
      ).toBeNull();
      release();
      await expect.element(edit).toBeEnabled();
      await edit.click();
      await expect
        .element(screen.getByLabelText("单价", { exact: true }))
        .toHaveValue(8);
      await expect
        .element(screen.getByLabelText("描述与规格", { exact: true }))
        .toHaveValue("48W");
    },
  );
  it(`${kind} keeps editing disabled on item query failure`, async () => {
    const { screen, release } = await setup(kind);
    release(true);
    await expect.element(screen.getByRole("alert")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "编辑", exact: true }))
      .toBeDisabled();
  });
  it(`${kind} allows a genuinely empty document only after successful loading`, async () => {
    const { screen, release } = await setup(kind, true);
    const edit = screen.getByRole("button", { name: "编辑", exact: true });
    await expect.element(edit).toBeDisabled();
    release();
    await expect.element(edit).toBeEnabled();
    await edit.click();
    await expect
      .element(screen.getByRole("button", { name: "新增产品行", exact: true }))
      .toBeVisible();
  });
}
