import { expect, it, vi } from "vitest";
import fakeRestDataProvider from "ra-data-fakerest";
import {
  createOrderPackingList,
  packingTotals,
  resolvePackingItemDefaults,
  savePackingItem,
} from "./packingWorkflow";
import { readRelated } from "../outbound/workflow";
function setup() {
  return fakeRestDataProvider({
    romiku_orders: [{ id: "o", counterparty_snapshot: {} }],
    romiku_product_suppliers: [],
    romiku_order_items: [
      {
        id: "i",
        order_id: "o",
        sku: "A",
        quantity: 100,
        product_snapshot: {
          name: "Original",
          image_url: "https://example.com/a.jpg",
        },
      },
      {
        id: "done",
        order_id: "o",
        sku: "DONE",
        quantity: 12,
        product_snapshot: { name: "Already packed" },
      },
    ],
    romiku_order_item_remaining: [
      {
        id: "i",
        order_id: "o",
        ordered_quantity: 100,
        packed_quantity: 40,
        remaining_quantity: 60,
      },
      {
        id: "done",
        order_id: "o",
        ordered_quantity: 12,
        packed_quantity: 12,
        remaining_quantity: 0,
      },
    ],
    romiku_packing_lists: [
      { id: "p1", order_id: "o" },
      { id: "p2", order_id: "o" },
      { id: "p3", order_id: null },
    ],
    romiku_packing_items: [
      {
        id: "old",
        packing_list_id: "p1",
        order_id: "o",
        source_order_item_id: "i",
        quantity: 40,
      },
    ],
  });
}
it("packs a partial remaining quantity into another list and preserves Order snapshots", async () => {
  const p = setup();
  const source = (await p.getOne("romiku_order_items", { id: "i" })).data;
  await savePackingItem(p, { id: "p2", order_id: "o" }, "i", {
    quantity: 20,
    cartons: 2,
    qty_per_carton: 10,
    length_cm: 50,
    width_cm: 40,
    height_cm: 30,
    carton_weight_kg: 8,
    remark: "Fragile",
    product_snapshot: { shipping_mark: "MARK" },
  });
  const rows = await readRelated(p, "romiku_packing_items", {});
  expect(rows).toHaveLength(2);
  expect(rows[1]).toMatchObject({
    packing_list_id: "p2",
    quantity: 20,
    sku: "A",
    product_snapshot: {
      name: "Original",
      image_url: "https://example.com/a.jpg",
      shipping_mark: "MARK",
    },
  });
  expect((await p.getOne("romiku_order_items", { id: "i" })).data).toEqual(
    source,
  );
  expect(packingTotals([rows[1]])).toEqual({
    cartons: 2,
    cbm: 0.12,
    weight: 16,
  });
});
it("creates an Order Packing List with each remaining saved Order snapshot and skips complete lines", async () => {
  const p = setup();
  const packing = await createOrderPackingList(p, "o");
  const rows = await readRelated(p, "romiku_packing_items", {
    packing_list_id: packing.id,
  });

  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    packing_list_id: packing.id,
    order_id: "o",
    source_order_item_id: "i",
    quantity: 60,
    cartons: 0,
    sku: "A",
    product_snapshot: {
      name: "Original",
      image_url: "https://example.com/a.jpg",
    },
  });
  expect(packing.buyer_snapshot).toEqual({});
});
it("prefers saved Order packing values over preferred-supplier defaults", () => {
  expect(
    resolvePackingItemDefaults(
      {
        quantity: 48,
        packing_snapshot: {
          qty_per_carton: 12,
          cartons: 4,
          length_cm: 55,
          width_cm: 45,
          height_cm: 35,
          carton_weight_kg: 10.5,
        },
      },
      48,
      {
        qtyPerCarton: 24,
        lengthCm: 50,
        widthCm: 40,
        heightCm: 30,
        cartonWeightKg: 12.5,
      },
    ),
  ).toMatchObject({
    quantity: 48,
    qty_per_carton: 12,
    length_cm: 55,
    width_cm: 45,
    height_cm: 35,
    carton_weight_kg: 10.5,
    cartons: 4,
  });
});
it("uses preferred or sole supplier values only for Order packing values that are missing", () => {
  expect(
    resolvePackingItemDefaults({ quantity: 24, packing_snapshot: {} }, 24, {
      qtyPerCarton: 24,
      lengthCm: 50,
      widthCm: 40,
      heightCm: 30,
      cartonWeightKg: 12.5,
    }),
  ).toMatchObject({
    qty_per_carton: 24,
    length_cm: 50,
    width_cm: 40,
    height_cm: 30,
    carton_weight_kg: 12.5,
  });
  expect(
    resolvePackingItemDefaults(
      { quantity: 24, packing_snapshot: {} },
      24,
      undefined,
    ),
  ).toMatchObject({
    qty_per_carton: null,
    length_cm: 0,
    width_cm: 0,
    height_cm: 0,
    carton_weight_kg: 0,
  });
});
it("applies one batched supplier-default result to bulk Order Packing creation", async () => {
  const p = setup();
  const defaults = vi.fn(
    async () =>
      new Map([
        [
          "i",
          {
            qtyPerCarton: 24,
            lengthCm: 50,
            widthCm: 40,
            heightCm: 30,
            cartonWeightKg: 12.5,
          },
        ],
      ]),
  );
  const packing = await createOrderPackingList(p, "o", defaults);
  const item = (await readRelated(p, "romiku_packing_items", {})).find(
    (row) => row.packing_list_id === packing.id,
  );

  expect(defaults).toHaveBeenCalledTimes(1);
  expect(item).toMatchObject({
    quantity: 60,
    qty_per_carton: 24,
    length_cm: 50,
    width_cm: 40,
    height_cm: 30,
    carton_weight_kg: 12.5,
  });
});
it("rolls back a newly created Packing List when an automatic item import fails", async () => {
  const p = setup();
  const create = p.create.bind(p);
  (p as any).create = async (resource: string, params: any) => {
    if (resource === "romiku_packing_items")
      throw new Error("simulated item failure");
    return create(resource, params);
  };

  await expect(createOrderPackingList(p, "o")).rejects.toThrow(/已撤销/);
  expect(await readRelated(p, "romiku_packing_lists", {})).toHaveLength(3);
  expect(await readRelated(p, "romiku_packing_items", {})).toHaveLength(1);
});
it("blocks overpacking and invalid dimensions before a write", async () => {
  const p = setup();
  await expect(
    savePackingItem(p, { id: "p2", order_id: "o" }, "i", { quantity: 61 }),
  ).rejects.toThrow(/剩余/);
  await expect(
    savePackingItem(p, { id: "p2", order_id: "o" }, "i", {
      quantity: 20,
      cartons: 1.5,
    }),
  ).rejects.toThrow(/箱数/);
  await expect(
    savePackingItem(p, { id: "p2", order_id: "o" }, "i", {
      quantity: 20,
      length_cm: -1,
    }),
  ).rejects.toThrow(/长度/);
  expect(await readRelated(p, "romiku_packing_items", {})).toHaveLength(1);
});
it("credits the edited line quantity back while retaining its immutable source", async () => {
  const p = setup();
  const previous = (await p.getOne("romiku_packing_items", { id: "old" })).data;
  await savePackingItem(
    p,
    { id: "p1", order_id: "o" },
    "i",
    { quantity: 100 },
    previous,
  );
  expect(
    (await p.getOne("romiku_packing_items", { id: "old" })).data.quantity,
  ).toBe(100);
  await expect(
    savePackingItem(
      p,
      { id: "p2", order_id: "o" },
      "i",
      { quantity: 1 },
      previous,
    ),
  ).rejects.toThrow(/来源/);
});
it("saves an independent Packing product snapshot without reading an Order item", async () => {
  const p = setup();
  await savePackingItem(p, { id: "p3", order_id: null }, "", {
    sku: "DIRECT-1",
    sanity_product_id: "sanity-direct-1",
    quantity: 12,
    cartons: 1,
    qty_per_carton: 12,
    length_cm: 50,
    width_cm: 40,
    height_cm: 30,
    carton_weight_kg: 8,
    product_snapshot: {
      name: "Saved direct product",
      image_url: "https://example.com/direct.jpg",
      specification: "Saved specification",
      unit: "PCS",
    },
  });

  const direct = (await readRelated(p, "romiku_packing_items", {})).find(
    (item) => item.sku === "DIRECT-1",
  );
  expect(direct).toMatchObject({
    packing_list_id: "p3",
    order_id: null,
    source_order_item_id: null,
    sanity_product_id: "sanity-direct-1",
    product_snapshot: {
      name: "Saved direct product",
      unit: "PCS",
    },
  });
});

// A stale quantity must never override a fully specified standard carton plan.
it("persists CTN × Qty/Ctn instead of a stale independent quantity", async () => {
  const provider = setup();
  const { data: created } = await savePackingItem(provider, { id: "p3" }, "", {
    sku: "STANDARD",
    quantity: 1,
    cartons: 5,
    qty_per_carton: 32,
    length_cm: 50,
    width_cm: 50,
    height_cm: 50,
    carton_weight_kg: 55,
    product_snapshot: { name: "Saved", specification: "Spec", unit: "PCS" },
  });
  const saved = (
    await provider.getOne("romiku_packing_items", { id: created.id })
  ).data;
  expect(saved.quantity).toBe(160);
  expect(packingTotals([saved])).toEqual({
    cartons: 5,
    cbm: 0.625,
    weight: 275,
  });
});
it("checks Order remaining capacity against the computed carton quantity", async () => {
  const provider = setup();
  await expect(
    savePackingItem(provider, { id: "p2", order_id: "o" }, "i", {
      quantity: 1,
      cartons: 5,
      qty_per_carton: 32,
    }),
  ).rejects.toThrow("数量超过剩余可装箱数量（60）");
  expect(await readRelated(provider, "romiku_packing_items", {})).toHaveLength(
    1,
  );
});
