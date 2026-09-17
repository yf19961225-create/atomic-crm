import { expect, it } from "vitest";
import fakeRestDataProvider from "ra-data-fakerest";
import { createProductionOrders } from "./productionWorkflow";
import { readRelated } from "../outbound/workflow";

it("groups selected Order snapshots into one Production Order per supplier without changing sources", async () => {
  const provider = fakeRestDataProvider({
    romiku_orders: [{ id: "o" }],
    romiku_suppliers: [
      { id: "s1", name: "Factory One", address: "Address" },
      { id: "s2", name: "Factory Two" },
    ],
    romiku_order_items: [1, 2, 3].map((id) => ({
      id: `i${id}`,
      order_id: "o",
      sku: `SKU${id}`,
      quantity: 100,
      product_snapshot: {
        name: "Original",
        image_url: "https://example.com/a.jpg",
      },
      packing_snapshot: { material: "Paper" },
    })),
    romiku_production_orders: [],
    romiku_production_items: [],
  });
  const before = await readRelated(provider, "romiku_order_items", {});
  const result = await createProductionOrders(provider, "o", [
    { itemId: "i1", supplierId: "s1", quantity: 30 },
    { itemId: "i2", supplierId: "s1", quantity: 40 },
    { itemId: "i3", supplierId: "s2", quantity: 50 },
  ]);
  expect(result).toHaveLength(2);
  const headers = await readRelated(provider, "romiku_production_orders", {});
  expect(headers.map((h) => h.supplier_id)).toEqual(["s1", "s2"]);
  expect(headers[0].supplier_snapshot).toMatchObject({
    name: "Factory One",
    address: "Address",
  });
  const lines = await readRelated(provider, "romiku_production_items", {});
  expect(
    lines.filter((i) => i.production_order_id === headers[0].id),
  ).toHaveLength(2);
  expect(lines[0]).toMatchObject({
    source_order_item_id: "i1",
    quantity: 30,
    packaging_snapshot: { material: "Paper" },
    product_snapshot: { name: "Original" },
  });
  await provider.update("romiku_production_items", {
    id: lines[0].id,
    previousData: lines[0],
    data: { product_snapshot: { name: "Factory copy" } },
  });
  expect(await readRelated(provider, "romiku_order_items", {})).toEqual(before);
});
it("validates every supplier and source before creating any production document", async () => {
  const provider = fakeRestDataProvider({
    romiku_order_items: [
      { id: "i", order_id: "another", sku: "A", quantity: 10 },
    ],
    romiku_suppliers: [{ id: "s", name: "Factory" }],
    romiku_production_orders: [],
  });
  await expect(
    createProductionOrders(provider, "o", [
      { itemId: "i", supplierId: "s", quantity: 1 },
    ]),
  ).rejects.toThrow(/Order/);
  await expect(
    createProductionOrders(provider, "o", [
      { itemId: "i", supplierId: "", quantity: 1 },
    ]),
  ).rejects.toThrow(/supplier/i);
  expect(await readRelated(provider, "romiku_production_orders", {})).toEqual(
    [],
  );
});
