import { beforeEach, expect, it, vi } from "vitest";
import fakeRestDataProvider from "ra-data-fakerest";
import { createOrderPackingList } from "./packingWorkflow";
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
it("creates an Order Packing header and all source rows with one atomic request", async () => {
  const provider = atomicProvider(
    fakeRestDataProvider({
      romiku_orders: [
        { id: "o", counterparty_snapshot: { company_name: "Buyer" } },
      ],
      romiku_order_items: [
        {
          id: "s",
          order_id: "o",
          sku: "A",
          quantity: 10,
          product_snapshot: { name: "A" },
        },
      ],
      romiku_order_item_remaining: [
        { id: "s", order_id: "o", remaining_quantity: 10 },
      ],
      romiku_product_suppliers: [],
    }),
  );
  const create = vi.spyOn(provider, "create");
  atomic.mockImplementation(async (intent) => ({
    header: { id: intent.documentId, ...intent.header },
    items: intent.items,
    revision: 1,
  }));
  const result = await createOrderPackingList(provider, "o");
  expect(create).not.toHaveBeenCalled();
  expect(atomic).toHaveBeenCalledTimes(1);
  expect(atomic.mock.calls[0][0]).toMatchObject({
    kind: "packing",
    expectedRevision: 0,
    header: { order_id: "o", buyer_snapshot: { company_name: "Buyer" } },
    items: [{ source_order_item_id: "s", sku: "A", quantity: 10, cartons: 0 }],
  });
  expect(result.id).toBeTruthy();
});
it("does not compensate an uncertain atomic result with independent deletes", async () => {
  const provider = atomicProvider(
    fakeRestDataProvider({
      romiku_orders: [{ id: "o" }],
      romiku_order_items: [],
      romiku_order_item_remaining: [],
      romiku_product_suppliers: [],
    }),
  );
  const remove = vi.spyOn(provider, "delete");
  atomic.mockRejectedValue(new Error("unknown result"));
  await expect(createOrderPackingList(provider, "o")).rejects.toThrow(
    "保存结果尚未确认",
  );
  expect(remove).not.toHaveBeenCalled();
});
