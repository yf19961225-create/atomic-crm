import { expect, it, vi } from "vitest";
import { useState } from "react";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import baseFakeRestDataProvider from "ra-data-fakerest";
import { withAtomicDocuments } from "../commercial/tests/withAtomicDocuments";
const fakeRestDataProvider: typeof baseFakeRestDataProvider = (...args) =>
  withAtomicDocuments(baseFakeRestDataProvider(...args));
import { MemoryRouter, Routes, Route } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { FulfillmentDetail } from "../production/FulfillmentPages";
import { PackingCreate } from "./PackingCreate";
import { PackingItemsGrid } from "./PackingItemsGrid";
import { FulfillmentItems } from "../production/FulfillmentItems";
import { useHasAppDraft } from "../updates/drafts";
function DraftStatus() {
  return (
    <output aria-label="draft-status">
      {useHasAppDraft() ? "dirty" : "clean"}
    </output>
  );
}
const row = {
  id: "line",
  source_order_item_id: "source",
  sku: "SKU",
  quantity: 1,
  cartons: 5,
  qty_per_carton: 32,
  length_cm: null,
  product_snapshot: { unit: "PCS" },
};
it("create selectors start clean, dirty on changes, and clean when reverted", async () => {
  const screen = await render(
    <MemoryRouter initialEntries={["/?order=order"]}>
      <CoreAdminContext
        dataProvider={fakeRestDataProvider({ romiku_orders: [] })}
      >
        <PackingCreate />
        <DraftStatus />
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await expect
    .element(screen.getByLabelText("draft-status"))
    .toHaveTextContent("clean");
  await screen.getByLabelText("直接创建 / 不关联订单").click();
  await expect
    .element(screen.getByLabelText("draft-status"))
    .toHaveTextContent("dirty");
  await screen.getByLabelText("从 Order 创建").click();
  await expect
    .element(screen.getByLabelText("draft-status"))
    .toHaveTextContent("clean");
});
it("quantity repair is saveable but clean; canonical edits survive refetch and revert cleanly", async () => {
  function Fixture() {
    const [items, setItems] = useState([row]);
    return (
      <CoreAdminContext dataProvider={fakeRestDataProvider({})}>
        <PackingItemsGrid
          parent={{ id: "packing", revision: 1, order_id: "order" }}
          items={items}
          onSaved={async () => {}}
        />
        <button
          onClick={() =>
            setItems([{ ...row, updated_at: "later" } as typeof row])
          }
        >
          Refetch
        </button>
        <DraftStatus />
      </CoreAdminContext>
    );
  }
  const screen = await render(<Fixture />);
  await expect
    .element(screen.getByRole("button", { name: "保存", exact: true }))
    .toBeEnabled();
  await expect
    .element(screen.getByLabelText("draft-status"))
    .toHaveTextContent("clean");
  await screen.getByLabelText("cartons SKU").fill("6");
  await expect
    .element(screen.getByLabelText("draft-status"))
    .toHaveTextContent("dirty");
  await screen.getByRole("button", { name: "Refetch" }).click();
  await expect.element(screen.getByLabelText("cartons SKU")).toHaveValue(6);
  await screen.getByLabelText("cartons SKU").fill("5");
  await expect
    .element(screen.getByLabelText("draft-status"))
    .toHaveTextContent("clean");
  await screen.getByLabelText("length_cm SKU").fill("0");
  await expect
    .element(screen.getByLabelText("draft-status"))
    .toHaveTextContent("clean");
  await screen.getByLabelText("unit SKU").fill("SETS");
  await expect
    .element(screen.getByLabelText("draft-status"))
    .toHaveTextContent("dirty");
  await screen.getByRole("button", { name: "取消", exact: true }).click();
  await expect
    .element(screen.getByLabelText("draft-status"))
    .toHaveTextContent("clean");
});
it("opening a production item editor is clean and field edits/reverts are canonical", async () => {
  const screen = await render(
    <CoreAdminContext
      dataProvider={fakeRestDataProvider({
        romiku_order_items: [{ id: "source", order_id: "order", sku: "SKU" }],
      })}
    >
      <FulfillmentItems
        kind="production"
        parent={{ id: "production", order_id: "order" }}
        items={[row]}
        onChanged={async () => {}}
      />
      <DraftStatus />
    </CoreAdminContext>,
  );
  await screen
    .getByRole("button", { name: "编辑生产产品项", exact: true })
    .click();
  await expect
    .element(screen.getByLabelText("draft-status"))
    .toHaveTextContent("clean");
  await screen.getByLabelText("数量", { exact: true }).fill("2");
  await expect
    .element(screen.getByLabelText("draft-status"))
    .toHaveTextContent("dirty");
  await screen.getByLabelText("数量", { exact: true }).fill("1.0");
  await expect
    .element(screen.getByLabelText("draft-status"))
    .toHaveTextContent("clean");
  await screen.getByLabelText("生产备注（中文）").fill("note");
  await screen.getByRole("button", { name: "取消", exact: true }).click();
  await expect
    .element(screen.getByLabelText("draft-status"))
    .toHaveTextContent("clean");
});

it("packing header ignores metadata refetch, preserves edits, and clears after save", async () => {
  const provider = fakeRestDataProvider({
    romiku_packing_lists: [
      {
        id: "packing",
        name: "Original",
        notes: null,
        packing_at: "2026-10-26T00:00:00.000Z",
      },
    ],
    romiku_packing_items: [],
    romiku_status_history: [],
  });
  function Refetch() {
    const cache = useQueryClient();
    return (
      <button
        onClick={async () => {
          await provider.update("romiku_packing_lists", {
            id: "packing",
            data: { updated_at: "later" },
            previousData: { id: "packing" },
          });
          await cache.invalidateQueries();
        }}
      >
        Refetch header
      </button>
    );
  }
  const screen = await render(
    <MemoryRouter initialEntries={["/packing/packing"]}>
      <CoreAdminContext dataProvider={provider}>
        <Routes>
          <Route
            path="/packing/:id"
            element={
              <>
                <FulfillmentDetail kind="packing" />
                <Refetch />
                <DraftStatus />
              </>
            }
          />
        </Routes>
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await expect
    .element(screen.getByLabelText("draft-status"))
    .toHaveTextContent("clean");
  await screen.getByText("装箱单详情", { exact: true }).click();
  await screen.getByRole("button", { name: "Refetch header" }).click();
  await expect
    .element(screen.getByLabelText("draft-status"))
    .toHaveTextContent("clean");
  await screen.getByLabelText("装箱名称").fill("Edited");
  await expect
    .element(screen.getByLabelText("draft-status"))
    .toHaveTextContent("dirty");
  await screen.getByRole("button", { name: "Refetch header" }).click();
  await expect.element(screen.getByLabelText("装箱名称")).toHaveValue("Edited");
  await screen.getByLabelText("装箱名称").fill("Original");
  await screen.getByLabelText("装箱备注").fill("");
  await expect
    .element(screen.getByLabelText("draft-status"))
    .toHaveTextContent("clean");
  await screen
    .getByRole("button", { name: "导出信息 / Document Details" })
    .click();
  await expect
    .element(screen.getByLabelText("draft-status"))
    .toHaveTextContent("clean");
  await screen.getByLabelText("Buyer email").fill("buyer@example.com");
  await expect
    .element(screen.getByLabelText("draft-status"))
    .toHaveTextContent("dirty");
  await screen.getByLabelText("Buyer email").fill("");
  await expect
    .element(screen.getByLabelText("draft-status"))
    .toHaveTextContent("clean");
  await screen.getByLabelText("装箱名称").fill("Saved");
  await screen.getByRole("button", { name: "保存装箱单", exact: true }).click();
  await expect
    .element(screen.getByLabelText("draft-status"))
    .toHaveTextContent("clean");
});

it("Packing header recovery preserves B after its submit is rejected while A is unresolved", async () => {
  sessionStorage.clear();
  const provider = fakeRestDataProvider({
    romiku_packing_lists: [
      {
        id: "packing-recover",
        revision: 1,
        name: "Original",
        notes: null,
        packing_at: "2026-10-26T00:00:00.000Z",
      },
    ],
    romiku_packing_items: [],
    romiku_status_history: [],
  });
  const save = provider.documentSave.bind(provider),
    lookup = provider.documentSaveResult.bind(provider);
  vi.spyOn(provider, "documentSave").mockImplementationOnce(async (args) => {
    await save(args);
    throw new TypeError("response lost");
  });
  const resultLookup = vi
    .spyOn(provider, "documentSaveResult")
    .mockResolvedValue(null);
  const screen = await render(
    <MemoryRouter initialEntries={["/packing/packing-recover"]}>
      <CoreAdminContext dataProvider={provider}>
        <Routes>
          <Route
            path="/packing/:id"
            element={<FulfillmentDetail kind="packing" />}
          />
        </Routes>
      </CoreAdminContext>
    </MemoryRouter>,
  );
  await screen.getByText("装箱单详情", { exact: true }).click();
  await screen.getByLabelText("装箱名称").fill("A");
  await screen.getByRole("button", { name: "保存装箱单", exact: true }).click();
  await expect.element(screen.getByRole("alert")).toHaveTextContent("尚未确认");
  await screen.getByLabelText("装箱名称").fill("B");
  await screen.getByRole("button", { name: "保存装箱单", exact: true }).click();
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("原保存结果");
  resultLookup.mockImplementation(lookup);
  await screen
    .getByRole("button", { name: "查询原保存结果", exact: true })
    .click();
  await expect.element(screen.getByLabelText("装箱名称")).toHaveValue("B");
  expect(provider.documentSave).toHaveBeenCalledTimes(1);
  expect(
    (await provider.getOne("romiku_packing_lists", { id: "packing-recover" }))
      .data.name,
  ).toBe("A");
});
