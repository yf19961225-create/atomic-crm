import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { QuoteDetail } from "./QuotePages";
import { useHasAppDraft } from "../updates/drafts";
import { useDocumentEditSession } from "../commercial/useDocumentEditSession";

vi.mock("@/components/atomic-crm/providers/supabase/supabase", () => ({
  getSupabaseClient: () => ({ rpc: async () => ({ data: [], error: null }) }),
}));
const item = {
  id: "qi",
  quote_id: "q",
  sku: "SUN5",
  position: 1,
  quantity: 120,
  requested_quantity_snapshot: 120,
  unit_price: 8,
  product_snapshot: {
    name: "Saved SUN5",
    specification: "48W\n24LEDS",
    image_url: "",
    unit: "PCS",
  },
  packing_snapshot: { qty_per_carton: 24, carton_cbm: 0.125 },
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function DraftState() {
  return <output aria-label="draft state">{String(useHasAppDraft())}</output>;
}
async function setup(
  source: boolean,
  empty = false,
  cached = false,
  legacy = false,
) {
  const gate = deferred();
  let blocked = true;
  let failure = false;
  const provider = fakeRestDataProvider({
    romiku_quotes: [
      {
        id: "q",
        document_number: "RFQ-QA",
        currency: "USD",
        status: "pending_quote",
        counterparty_snapshot: { name: "Buyer" },
        ...(source ? { source_website_inquiry_id: "in" } : {}),
      },
    ],
    romiku_quote_items: empty
      ? []
      : [
          {
            ...item,
            product_snapshot: {
              ...item.product_snapshot,
              specification: legacy
                ? "Specifications: 48W 24LEDS"
                : item.product_snapshot.specification,
            },
          },
        ],
    romiku_website_inquiries: [{ id: "in", document_number: "WI-QA" }],
    romiku_formal_customer_directory: [],
    sales: [],
  });
  const getList = provider.getList.bind(provider);
  provider.getList = async (resource, params) => {
    if (resource === "romiku_quote_items") {
      if (blocked) await gate.promise;
      if (failure) throw new Error("QA item query failure");
    }
    return getList(resource, params);
  };
  const cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  if (cached) cache.setQueryData(["quote-items", "q"], []);
  await page.viewport(1440, 1000);
  const screen = await render(
    <MemoryRouter initialEntries={["/quotes/q"]}>
      <CoreAdminContext dataProvider={provider} queryClient={cache}>
        <DraftState />
        <Routes>
          <Route path="/quotes/:id" element={<QuoteDetail />} />
        </Routes>
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await expect
    .element(screen.getByRole("heading", { name: "RFQ-QA" }))
    .toBeVisible();
  return {
    screen,
    provider,
    cache,
    release: (error = false) => {
      failure = error;
      blocked = false;
      gate.resolve();
    },
  };
}
for (const source of [false, true]) {
  it(`${source ? "Website-source" : "Direct"} Quote blocks early edit until complete items arrive`, async () => {
    const { screen, release } = await setup(source);
    const edit = screen.getByRole("button", { name: "编辑", exact: true });
    await expect.element(edit).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "保存", exact: true }).query(),
    ).toBeNull();
    release();
    await expect.element(edit).toBeEnabled();
    await edit.click();
    await expect
      .element(screen.getByLabelText("描述与规格"))
      .toHaveValue("48W\n24LEDS");
    await expect.element(screen.getByLabelText("Qty/Ctn")).toHaveValue(24);
    await expect
      .element(screen.getByLabelText("单价", { exact: true }))
      .toHaveValue(8);
    if (source)
      await expect.element(screen.getByText("询价数量：120")).toBeVisible();
  });
}
it("items error blocks editing and exposes a retry path", async () => {
  const { screen, release } = await setup(false);
  release(true);
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("报价单产品数据加载失败");
  await expect
    .element(screen.getByRole("button", { name: "编辑", exact: true }))
    .toBeDisabled();
});
it("a successful empty Direct Quote is distinct from pending items and can be edited", async () => {
  const { screen, release } = await setup(false, true);
  await expect
    .element(screen.getByRole("button", { name: "编辑", exact: true }))
    .toBeDisabled();
  release();
  await expect
    .element(screen.getByText("此报价单暂无产品项，可编辑后添加。"))
    .toBeVisible();
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await expect
    .element(screen.getByRole("button", { name: "新增产品行" }))
    .toBeEnabled();
});
it("background item/header refetch cannot overwrite an active draft; cancel restores saved data", async () => {
  const { screen, release, provider, cache } = await setup(false);
  release();
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await screen.getByLabelText("描述与规格").fill("Unsaved draft");
  await provider.update("romiku_quote_items", {
    id: "qi",
    data: {
      ...item,
      product_snapshot: {
        ...item.product_snapshot,
        specification: "New server snapshot",
      },
    },
    previousData: item,
  });
  await cache.invalidateQueries({ queryKey: ["quote-items", "q"] });
  await cache.invalidateQueries({ queryKey: ["romiku_quotes", "getOne"] });
  await expect
    .element(screen.getByLabelText("描述与规格"))
    .toHaveValue("Unsaved draft");
  await screen.getByRole("button", { name: "取消", exact: true }).click();
  await expect
    .element(screen.getByLabelText("描述与规格"))
    .toHaveValue("New server snapshot");
});
it("save refetches persisted items and subsequent edit starts from the new snapshot", async () => {
  const { screen, release, provider } = await setup(true);
  release();
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await screen.getByLabelText("描述与规格").fill("Saved edited spec");
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  await expect.element(screen.getByText("报价单已保存。")).toBeVisible();
  expect(
    (await provider.getOne("romiku_quote_items", { id: "qi" })).data
      .product_snapshot.specification,
  ).toBe("Saved edited spec");
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await expect
    .element(screen.getByLabelText("描述与规格"))
    .toHaveValue("Saved edited spec");
  await screen.getByLabelText("描述与规格").fill("Cancelled spec");
  await screen.getByRole("button", { name: "取消", exact: true }).click();
  await expect
    .element(screen.getByLabelText("描述与规格"))
    .toHaveValue("Saved edited spec");
});
it("the session handler itself refuses rapid start calls when editing data is not ready", async () => {
  function Harness() {
    const session = useDocumentEditSession({ id: "q" }, undefined, {
      readyForEdit: false,
    });
    return (
      <>
        <button
          onClick={() => {
            session.start();
            session.start();
          }}
        >
          Bypass UI
        </button>
        <output>{session.editing ? "editing" : "reading"}</output>
      </>
    );
  }
  const screen = await render(<Harness />);
  await screen.getByRole("button", { name: "Bypass UI" }).click();
  await expect.element(screen.getByRole("status")).toHaveTextContent("reading");
});

it("cached empty items cannot open a draft while a fresh response is pending", async () => {
  const { screen, release } = await setup(true, false, true);
  await expect
    .element(screen.getByRole("button", { name: "编辑", exact: true }))
    .toBeDisabled();
  release();
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await expect
    .element(screen.getByLabelText("描述与规格"))
    .toHaveValue("48W\n24LEDS");
});
it("header refetch and cached header errors block entry without discarding an active draft", async () => {
  const { screen, release, provider, cache } = await setup(false);
  release();
  await expect
    .element(screen.getByRole("button", { name: "编辑", exact: true }))
    .toBeEnabled();
  const gate = deferred();
  const getOne = provider.getOne.bind(provider);
  let fail = false;
  provider.getOne = async (resource, params) => {
    if (resource === "romiku_quotes") {
      await gate.promise;
      if (fail) throw new Error("QA header query failure");
    }
    return getOne(resource, params);
  };
  const pending = cache.invalidateQueries({
    queryKey: ["romiku_quotes", "getOne"],
  });
  await expect
    .element(screen.getByRole("button", { name: "编辑", exact: true }))
    .toBeDisabled();
  gate.resolve();
  await pending;
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await screen
    .getByLabelText("描述与规格")
    .fill("Keep draft across header error");
  fail = true;
  await cache.invalidateQueries({ queryKey: ["romiku_quotes", "getOne"] });
  await expect
    .element(screen.getByLabelText("描述与规格"))
    .toHaveValue("Keep draft across header error");
  await screen.getByRole("button", { name: "取消", exact: true }).click();
  await expect
    .element(screen.getByRole("button", { name: "编辑", exact: true }))
    .toBeDisabled();
});

it("legacy Quote specification display revert is clean without rewriting its saved snapshot", async () => {
  const { screen, release, provider } = await setup(true, false, false, true);
  release();
  await screen.getByRole("button", { name: "编辑", exact: true }).click();
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("false");
  await screen.getByLabelText("描述与规格").fill("Edited");
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("true");
  await screen.getByLabelText("描述与规格").fill("48W 24LEDS");
  await expect
    .element(screen.getByLabelText("draft state"))
    .toHaveTextContent("false");
  expect(
    (await provider.getOne("romiku_quote_items", { id: "qi" })).data
      .product_snapshot.specification,
  ).toBe("Specifications: 48W 24LEDS");
});
