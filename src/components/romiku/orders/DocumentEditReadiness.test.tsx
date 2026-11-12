import { beforeEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import rawFakeRestDataProvider from "ra-data-fakerest";
import { withAtomicDocuments } from "../commercial/tests/withAtomicDocuments";
const fakeRestDataProvider = (
  ...args: Parameters<typeof rawFakeRestDataProvider>
) => withAtomicDocuments(rawFakeRestDataProvider(...args));
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { DocumentDetail } from "./DocumentPages";

vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc: async () => ({ data: [], error: null }) }),
}));
async function setup(kind: "pi" | "order", cached = false) {
  let release!: () => void;
  let failure = false;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const provider = fakeRestDataProvider({
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
  });
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
  if (cached) cache.setQueryData(["document-snapshot", kind, "doc"], []);
  const screen = await render(
    <MemoryRouter initialEntries={["/document/doc"]}>
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
for (const kind of ["pi", "order"] as const) {
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
      .element(screen.getByText("无法加载产品项或合计。", { exact: false }))
      .toBeVisible();
    expect(
      screen.getByRole("button", { name: "编辑", exact: true }).query(),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("button", { name: "导出 XLSX", exact: true }).query(),
    ).toHaveProperty("disabled", true);
  });
}

it.each(["pi", "order"] as const)(
  "%s keeps an active draft after header refresh failure",
  async (kind) => {
    const { screen, provider, cache, release } = await setup(kind);
    release();
    await screen.getByRole("button", { name: "编辑", exact: true }).click();
    await screen
      .getByLabelText("描述与规格")
      .fill("Keep unsaved specification");
    const getOne = provider.getOne.bind(provider);
    provider.getOne = async (resource, params) => {
      if (resource === `romiku_${kind}s`) throw new Error("QA header failure");
      return getOne(resource, params);
    };
    await cache.invalidateQueries({ queryKey: [`romiku_${kind}s`, "getOne"] });
    await expect
      .element(
        screen.getByText("单据数据刷新失败，当前修改已保留。", {
          exact: false,
        }),
      )
      .toBeVisible();
    expect(screen.getByLabelText("描述与规格").query()).toHaveProperty(
      "value",
      "Keep unsaved specification",
    );
    await screen.getByRole("button", { name: "取消", exact: true }).click();
    expect(
      screen.getByRole("button", { name: "编辑", exact: true }).query(),
    ).toHaveProperty("disabled", true);
  },
);

beforeEach(() => sessionStorage.clear());
