import { withAtomicDocuments } from "../commercial/tests/withAtomicDocuments";
import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { QuoteDetail } from "./QuotePages";

vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc: async () => ({ data: [], error: null }) }),
}));
async function setup(kind: "quote", cached = false) {
  let release!: () => void;
  let failure = false;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const provider = withAtomicDocuments(
    fakeRestDataProvider({
      [`romiku_${kind}s`]: [
        {
          id: "doc",
          document_number: "READINESS-QA",
          currency: "USD",
          status: "draft",
        },
      ],
      [`romiku_${kind}_items`]: [
        {
          id: "line",
          [`${kind}_id`]: "doc",
          sku: "SAVED",
          quantity: 0.25,
          unit_price: 8,
          product_snapshot: {
            name: "Saved product",
            specification: "Saved specification",
          },
          packing_snapshot: {},
        },
      ],
      romiku_formal_customer_directory: [],
      romiku_production_orders: [],
      sales: [],
    }),
  );
  const getList = provider.getList.bind(provider);
  provider.getList = async (resource, params) => {
    if (resource === `romiku_${kind}_items`) {
      await gate;
      if (failure) throw new Error("QA item failure");
    }
    return getList(resource, params);
  };
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  if (cached) cache.setQueryData([`${kind}-items`, "doc"], []);
  const screen = await render(
    <MemoryRouter initialEntries={["/document/doc"]}>
      <CoreAdminContext dataProvider={provider} queryClient={cache}>
        <Routes>
          <Route path="/document/:id" element={<QuoteDetail />} />
        </Routes>
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await expect
    .element(screen.getByRole("heading", { name: "READINESS-QA", exact: true }))
    .toBeVisible();
  return {
    screen,
    provider,
    cache,
    release: (error = false) => {
      failure = error;
      release();
    },
  };
}
for (const kind of ["quote"] as const) {
  it.each([false, true])(
    `${kind} blocks edit and export while items load (cached=%s)`,
    async (cached) => {
      const { screen, release } = await setup(kind, cached);
      const edit = screen.getByRole("button", { name: "编辑", exact: true });
      try {
        expect(edit.query()).toHaveProperty("disabled", true);
        expect(
          screen
            .getByRole("button", { name: "导出 XLSX", exact: true })
            .query(),
        ).toHaveProperty("disabled", true);
      } finally {
        release();
      }
      await expect.element(edit).toBeEnabled();
      await edit.click();
      await expect
        .element(screen.getByLabelText("描述与规格"))
        .toHaveValue("Saved specification");
    },
  );
  it(`${kind} blocks edit and export after an item query error`, async () => {
    const { screen, release } = await setup(kind);
    release(true);
    await expect
      .element(
        screen.getByText("报价单产品数据加载失败，请刷新后重试。", {
          exact: false,
        }),
      )
      .toBeVisible();
    expect(
      screen.getByRole("button", { name: "编辑", exact: true }).query(),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("button", { name: "导出 XLSX", exact: true }).query(),
    ).toHaveProperty("disabled", true);
  });
}
