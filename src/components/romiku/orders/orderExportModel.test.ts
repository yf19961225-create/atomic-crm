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
    "other_expenses",
    "discount",
    "total",
    "deposit",
    "balance",
  ]);
  expect(model.moneyRows.find((row) => row.key === "discount")?.amount).toBe(
    -3,
  );
  expect(model.terms.some((term) => term.key === "payment")).toBe(false);
  expect(model.seller.company_name).toBe("Saved Seller");
  expect(model.buyer.company_name).toBe("Saved Buyer");
});
