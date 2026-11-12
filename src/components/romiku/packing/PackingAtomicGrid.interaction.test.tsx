import { beforeEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";
import { PackingItemsGrid } from "./PackingItemsGrid";
const atomic = vi.fn();
function atomicProvider(provider: ReturnType<typeof fakeRestDataProvider>) {
  return Object.assign(provider, {
    documentActor: async () => "packing-test",
    documentSnapshot: vi.fn(),
    documentSave: atomic,
    documentSaveResult: async () => null,
  });
}
beforeEach(() => {
  atomic.mockReset();
  sessionStorage.clear();
});
const row = {
  id: "line",
  sku: "A",
  position: 1,
  quantity: 2,
  cartons: 1,
  qty_per_carton: 2,
  length_cm: 1,
  width_cm: 2,
  height_cm: 3,
  carton_weight_kg: 4,
  product_snapshot: { unit: "PCS" },
  source_order_item_id: null,
};
it("submits full membership once with the revision captured before editing", async () => {
  const provider = atomicProvider(fakeRestDataProvider({}));
  const update = vi.spyOn(provider, "update");
  const onSaved = vi.fn(async () => {});
  atomic.mockImplementation(async (intent) => ({
    revision: 8,
    items: intent.items,
    header: { id: "packing", revision: 8 },
  }));
  const screen = await render(
    <CoreAdminContext dataProvider={provider}>
      <PackingItemsGrid
        parent={{ id: "packing", revision: 7 }}
        items={[row]}
        onSaved={onSaved}
      />
    </CoreAdminContext>,
  );
  await screen.getByLabelText("cartons A").fill("3");
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  await expect.poll(() => atomic.mock.calls.length).toBe(1);
  expect(atomic.mock.calls[0][0]).toMatchObject({
    documentId: "packing",
    expectedRevision: 7,
    header: {},
    items: [{ id: "line", quantity: 6, cartons: 3 }],
  });
  expect(update).not.toHaveBeenCalled();
  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
  await expect.element(screen.getByLabelText("cartons A")).toHaveValue(3);
});
it("keeps draft and baseline revision after a rejected whole-document save", async () => {
  atomic.mockRejectedValue(
    Object.assign(new Error("Document revision conflict"), { code: "PT409" }),
  );
  const screen = await render(
    <CoreAdminContext dataProvider={atomicProvider(fakeRestDataProvider({}))}>
      <PackingItemsGrid
        parent={{ id: "packing", revision: 7 }}
        items={[row]}
        onSaved={async () => {}}
      />
    </CoreAdminContext>,
  );
  await screen.getByLabelText("cartons A").fill("3");
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("Document revision conflict");
  await expect.element(screen.getByLabelText("cartons A")).toHaveValue(3);
  expect(atomic.mock.calls[0][0].expectedRevision).toBe(7);
});
it("does not replace newer Packing edits when a rejected second submit precedes recovery of the first", async () => {
  const provider = atomicProvider(fakeRestDataProvider({}));
  atomic.mockRejectedValueOnce(new TypeError("lost response"));
  const screen = await render(
    <CoreAdminContext dataProvider={provider}>
      <PackingItemsGrid
        parent={{ id: "packing", revision: 7 }}
        items={[row]}
        onSaved={async () => {}}
      />
    </CoreAdminContext>,
  );
  await screen.getByLabelText("cartons A").fill("3");
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  await expect.element(screen.getByRole("alert")).toHaveTextContent("尚未确认");
  await screen.getByLabelText("cartons A").fill("5");
  await screen.getByRole("button", { name: "保存", exact: true }).click();
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("原保存结果");
  Object.assign(provider, {
    documentSaveResult: async () => ({
      kind: "packing",
      document_id: "packing",
      revision: 8,
      header: { id: "packing", revision: 8 },
      items: [{ ...row, cartons: 3, quantity: 6 }],
    }),
  });
  await screen.getByRole("button", { name: "查询原保存结果" }).click();
  await expect.element(screen.getByLabelText("cartons A")).toHaveValue(5);
  expect(atomic).toHaveBeenCalledTimes(1);
});
