import { expect, it } from "vitest";
import { normalizePackingExportModel } from "./packingExportModel";

it("normalizes only saved Packing data into decimal totals", () => {
  const model = normalizePackingExportModel(
    {
      document_number: "PL-001",
      packing_at: "2026-10-02T02:00:00.000Z",
      seller_snapshot: { company_name: "Saved Seller" },
      buyer_snapshot: { company: "Saved Buyer" },
    },
    [
      {
        id: "late",
        position: 2,
        sku: "SKU-2",
        quantity: 20,
        cartons: 2,
        qty_per_carton: 10,
        length_cm: 50,
        width_cm: 40,
        height_cm: 30,
        carton_weight_kg: 12.5,
        total_cbm: 0.12,
        total_weight_kg: 25,
        product_snapshot: {
          name: "Saved product",
          image_url: "data:image/png;base64,AA==",
          specification: "Saved specification",
          unit: "PCS",
        },
      },
    ],
  );

  expect(model).toMatchObject({
    worksheetName: "PACKING LIST",
    document: { number: "PL-001", date: "2026.10.2" },
    seller: { company_name: "Saved Seller" },
    buyer: { company_name: "Saved Buyer" },
    totals: { cartons: 2, cbm: 0.12, weightKg: 25 },
  });
  expect(model.items[0]).toMatchObject({
    position: 1,
    sku: "SKU-2",
    unit: "PCS",
    cartonCbm: 0.06,
    totalCbm: 0.12,
    totalWeightKg: 25,
  });
});
