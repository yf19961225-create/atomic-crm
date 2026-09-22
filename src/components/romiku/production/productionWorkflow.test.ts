import { expect, it } from "vitest";
import fakeRestDataProvider from "ra-data-fakerest";
import { createProductionOrders } from "./productionWorkflow";
import { readRelated } from "../outbound/workflow";

it("creates one Production for every selected batch without supplier grouping", async () => {
  const provider = fakeRestDataProvider({
    romiku_orders: [{ id: "o" }],
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
    { itemId: "i1", quantity: 30 },
    { itemId: "i2", quantity: 40 },
    { itemId: "i3", quantity: 50 },
  ]);
  expect(result).toHaveLength(1);
  const headers = await readRelated(provider, "romiku_production_orders", {});
  expect(headers).toHaveLength(1);
  expect(headers[0]).toMatchObject({
    supplier_id: null,
    supplier_snapshot: null,
  });
  const lines = await readRelated(provider, "romiku_production_items", {});
  expect(
    lines.filter((i) => i.production_order_id === headers[0].id),
  ).toHaveLength(3);
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
it("validates every source before creating any production document", async () => {
  const provider = fakeRestDataProvider({
    romiku_order_items: [
      { id: "i", order_id: "another", sku: "A", quantity: 10 },
    ],
    romiku_production_orders: [],
  });
  await expect(
    createProductionOrders(provider, "o", [{ itemId: "i", quantity: 1 }]),
  ).rejects.toThrow(/订单/);
  expect(await readRelated(provider, "romiku_production_orders", {})).toEqual(
    [],
  );
});
