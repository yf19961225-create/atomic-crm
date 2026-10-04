import { expect, it, vi } from "vitest";
import fakeRestDataProvider from "ra-data-fakerest";
import { createProductionOrders } from "./productionWorkflow";
import { readRelated } from "../outbound/workflow";

it("creates one Production for every selected batch without supplier grouping", async () => {
  const provider = fakeRestDataProvider({
    romiku_orders: [
      {
        id: "o",
        production_defaults_snapshot: {
          schema_version: 2,
          initialized_at: "2026-10-03",
          source: { kind: "manual" },
        },
      },
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

it("copies only saved Order marking once and keeps Production independent of customer and Order changes", async () => {
  const asset = {
    bucket: "romiku-marking-assets",
    path: "front-original.png",
    name: "front.png",
    mime_type: "image/png",
    size: 123,
  };
  const profile = {
    version: 1,
    front_mark: { mode: "image", text: "Old front", image_asset: asset },
    side_mark: { mode: "text", text: "Old side" },
    small_label: { mode: "none", text: "" },
    labeling_requirements: "Label once",
    production_requirements: "Customer packing",
  };
  const provider = fakeRestDataProvider({
    romiku_formal_customers: [{ id: "c", marking_profile: profile }],
    romiku_orders: [
      {
        id: "o",
        formal_customer_id: "c",
        notes: "Ignored latest notes",
        production_defaults_snapshot: {
          ...profile,
          schema_version: 2,
          initialized_at: "2026-10-03",
          production_requirements: "Order requirements\nCustomer packing",
          source: { kind: "customer" },
        },
      },
    ],
    romiku_order_items: [
      {
        id: "i",
        order_id: "o",
        sku: "SUN5",
        quantity: 160,
        product_snapshot: {
          name: "Original",
          specification: "48W",
          image_url: "https://example.com/old.jpg",
        },
        packing_snapshot: { cartons: 5, qty_per_carton: 32 },
      },
    ],
    romiku_production_orders: [],
    romiku_production_items: [],
  });
  const getOne = vi.spyOn(provider, "getOne");
  const [production] = await createProductionOrders(provider, "o", [
    { itemId: "i", quantity: 150 },
  ]);
  expect(
    getOne.mock.calls.some(
      ([resource]) => resource === "romiku_formal_customers",
    ),
  ).toBe(false);
  expect(production.marking_snapshot).toMatchObject({
    front_mark: { image_asset: asset },
    side_mark: { text: "Old side" },
    labeling_requirements: "Label once",
    production_requirements: "Order requirements\nCustomer packing",
  });
  await provider.update("romiku_formal_customers", {
    id: "c",
    data: {
      marking_profile: {
        ...profile,
        front_mark: { mode: "text", text: "New front" },
      },
    },
    previousData: { id: "c" },
  });
  await provider.update("romiku_orders", {
    id: "o",
    data: {
      notes: "Changed Order",
      production_defaults_snapshot: {
        schema_version: 2,
        initialized_at: "2026-10-04",
        source: { kind: "manual" },
        small_label: { mode: "text", text: "P02 only" },
      },
    },
    previousData: { id: "o" },
  });
  await provider.update("romiku_order_items", {
    id: "i",
    data: { product_snapshot: { name: "Changed product" } },
    previousData: { id: "i" },
  });
  const [second] = await createProductionOrders(provider, "o", [
    { itemId: "i", quantity: 20 },
  ]);
  expect(second.marking_snapshot.small_label.text).toBe("P02 only");
  const saved = (
    await provider.getOne("romiku_production_orders", { id: production.id })
  ).data;
  expect(saved.marking_snapshot).toEqual(production.marking_snapshot);
  const [line] = await readRelated(provider, "romiku_production_items", {});
  expect(line).toMatchObject({
    position: 1,
    quantity: 150,
    packaging_snapshot: { cartons: 5, qty_per_carton: 32 },
    product_snapshot: { name: "Original", specification: "48W" },
  });
});

it("creates with an empty independent marking snapshot when no customer defaults exist", async () => {
  const provider = fakeRestDataProvider({
    romiku_orders: [
      {
        id: "o",
        production_defaults_snapshot: {
          schema_version: 2,
          initialized_at: "2026-10-03",
          source: { kind: "manual" },
        },
      },
    ],
    romiku_order_items: [{ id: "i", order_id: "o", sku: "A" }],
    romiku_production_orders: [],
    romiku_production_items: [],
  });
  const [production] = await createProductionOrders(provider, "o", [
    { itemId: "i", quantity: 1 },
  ]);
  expect(production.marking_snapshot).toMatchObject({
    version: 1,
    front_mark: { mode: "none", text: "", image_asset: null },
    labeling_requirements: "",
    production_requirements: "",
  });
});

it("refuses an uninitialized Order and never falls back to current Customer or notes", async () => {
  const provider = fakeRestDataProvider({
    romiku_orders: [
      { id: "o", formal_customer_id: "c", notes: "Do not guess" },
    ],
    romiku_formal_customers: [
      { id: "c", marking_profile: { small_label: { text: "New" } } },
    ],
    romiku_order_items: [{ id: "i", order_id: "o", sku: "A" }],
    romiku_production_orders: [],
  });
  await expect(
    createProductionOrders(provider, "o", [{ itemId: "i", quantity: 1 }]),
  ).rejects.toThrow("尚未初始化");
  expect(await readRelated(provider, "romiku_production_orders", {})).toEqual(
    [],
  );
});
