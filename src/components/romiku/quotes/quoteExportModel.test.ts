import { expect, it } from "vitest";
import { normalizeQuoteExportModel } from "./quoteExportModel";

it("normalizes only saved Quote and item snapshots for the fixed Quote template", () => {
  const model = normalizeQuoteExportModel(
    {
      document_number: "RFQ260930001",
      document_date: "2026-09-30",
      currency: "CNY",
      terms_snapshot: {
        quote_export: { seller: { company_name: "Saved Seller" } },
      },
    },
    [
      {
        id: "late",
        position: 2,
        sku: "SKU-2",
        unit_price: 12.5,
        product_snapshot: {
          name: "Saved B",
          image_url: "data:image/png;base64,AA==",
          specification: "B spec",
        },
        packing_snapshot: {
          qty_per_carton: 24,
          length_cm: 50,
          width_cm: 40,
          height_cm: 30,
        },
      },
      {
        id: "first",
        position: 1,
        sku: "SKU-1",
        unit_price: 8,
        product_snapshot: { name: "Saved A", specification: "A spec" },
        packing_snapshot: { qty_per_carton: 12, carton_cbm: 0.045 },
      },
    ],
  );

  expect(model).toMatchObject({
    worksheetName: "ROMIKU PI",
    document: { number: "RFQ260930001", date: "2026-09-30" },
    currency: "CNY",
    seller: { company_name: "Saved Seller" },
  });
  expect(model.items).toEqual([
    expect.objectContaining({
      position: 1,
      sku: "SKU-1",
      qtyPerCarton: 12,
      cartonCbm: 0.045,
      unitPrice: 8,
    }),
    expect.objectContaining({
      position: 2,
      sku: "SKU-2",
      qtyPerCarton: 24,
      cartonCbm: 0.06,
      unitPrice: 12.5,
    }),
  ]);
});

it("leaves CBM blank when the saved Quote snapshot has neither a value nor complete dimensions", () => {
  const [item] = normalizeQuoteExportModel({}, [
    {
      id: "item",
      sku: "SKU",
      unit_price: 1,
      packing_snapshot: { qty_per_carton: 10 },
    },
  ]).items;
  expect(item.cartonCbm).toBeNull();
});

it("uses explicit website provenance and each saved requested quantity, not current quantity", () => {
  const model = normalizeQuoteExportModel(
    {
      source_website_inquiry_id: "wi",
      counterparty_snapshot: {
        company: "ABC",
        contact_name: "Anna",
        whatsapp: "+57 300",
        email: "saved@example.com",
      },
    },
    [
      { requested_quantity_snapshot: 120, quantity: 240 },
      { requested_quantity_snapshot: null },
    ] as never,
  );
  expect(model.templateKind).toBe("website");
  expect(model.buyer.company_name).toBe("ABC\nAnna");
  expect(model.buyer.tel_whatsapp).toBe("+57 300");
  expect(model.items.map((item) => item.requestedQuantity)).toEqual([
    120,
    null,
  ]);
  expect(
    normalizeQuoteExportModel({}, [
      { requested_quantity_snapshot: 120 },
    ] as never).templateKind,
  ).toBe("direct");
});
