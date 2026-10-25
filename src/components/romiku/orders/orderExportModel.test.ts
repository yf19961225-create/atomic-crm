import { expect, it } from "vitest";
import { normalizeOrderExportModel } from "./orderExportModel";

it("normalizes only saved snapshots, sorts position/id and inserts money rows conditionally", () => {
  const model = normalizeOrderExportModel(
    {
      document_number: "RCI260923001",
      document_date: "2026-09-23",
      currency: "USD",
      freight: 20,
      other_expenses: 5,
      discount: 3,
      deposit_percent: 25,
      notes: "Use customer logo packaging.",
      counterparty_snapshot: { name: "Saved Buyer" },
      terms_snapshot: {
        order_export: {
          seller: { company_name: "Saved Seller" },
          terms: { payment: { text: "saved", visible: false } },
        },
      },
    },
    [
      {
        id: "b",
        position: 2,
        sku: "B",
        quantity: 2,
        unit_price: 10,
        product_snapshot: { name: "Saved B", specification: "Spec B" },
        packing_snapshot: { cartons: 1, qty_per_carton: 2 },
      },
      {
        id: "a",
        position: 1,
        sku: "A",
        quantity: 1,
        unit_price: 10,
        product_snapshot: { name: "Saved A" },
        packing_snapshot: {},
      },
    ],
  );
  expect(model.items.map((item) => item.sku)).toEqual(["A", "B"]);
  expect(model.moneyRows.map((row) => row.key)).toEqual([
    "subtotal",
    "freight",
    "total",
    "deposit",
    "balance",
  ]);
  expect(model.moneyRows.find((row) => row.key === "total")?.amount).toBe(52);
  expect(model.terms.some((term) => term.key === "payment")).toBe(false);
  expect(model.seller.company_name).toBe("Saved Seller");
  expect(model.buyer.company_name).toBe("Saved Buyer");
  expect(model.requirements).toBe("Use customer logo packaging.");
});

it("omits the complete Terms block when the saved Order snapshot hides it", () => {
  const model = normalizeOrderExportModel(
    {
      terms_snapshot: { order_export: { terms_visible: false } },
    },
    [],
  );

  expect(model.terms).toEqual([]);
});

it("exports customer codes only when visible while preserving each SKU and amount", () => {
  const items = [
    {
      id: "a",
      sku: "OUR-A",
      customer_code: "BUYER-A",
      quantity: 2,
      unit_price: 3,
      product_snapshot: {},
      packing_snapshot: {},
    },
    {
      id: "b",
      sku: "OUR-B",
      customer_code: "BUYER-B",
      quantity: 1,
      unit_price: 4,
      product_snapshot: {},
      packing_snapshot: {},
    },
  ];
  const visible = normalizeOrderExportModel(
    { terms_snapshot: { order_export: { customer_code_visible: true } } },
    items,
  );
  const hidden = normalizeOrderExportModel(
    { terms_snapshot: { order_export: { customer_code_visible: false } } },
    items,
  );
  expect(visible.customerCodeVisible).toBe(true);
  expect(
    visible.items.map((item) => [item.sku, item.customerCode, item.amount]),
  ).toEqual([
    ["OUR-A", "BUYER-A", 6],
    ["OUR-B", "BUYER-B", 4],
  ]);
  expect(hidden.customerCodeVisible).toBe(false);
  expect(hidden.items).toEqual(visible.items);
});
