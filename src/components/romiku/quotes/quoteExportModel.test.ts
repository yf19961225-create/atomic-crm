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

it.each([
  ["Specifications: 48W\n24LEDS", "48W\n24LEDS"],
  [" specification : 5MM ", "5MM"],
  ["Specs: Rechargeable", "Rechargeable"],
  ["48W 24LEDS", "48W 24LEDS"],
  ["Special Specifications: ABC", "Special Specifications: ABC"],
  ["Product Specifications: ABC", "Product Specifications: ABC"],
  [null, ""],
  ["", ""],
])(
  "normalizes only a leading specification label in both Quote export models: %s",
  (raw, expected) => {
    const snapshot = { specification: raw };
    for (const quote of [{}, { source_website_inquiry_id: "wi" }]) {
      expect(
        normalizeQuoteExportModel(quote, [{ product_snapshot: snapshot }])
          .items[0].specification,
      ).toBe(expected);
    }
    expect(snapshot.specification).toBe(raw);
  },
);

it("does not replace a missing translated specification with Chinese packaging", () => {
  const model = normalizeQuoteExportModel({}, [
    {
      sku: "MISSING",
      product_snapshot: {
        language: "en",
        name: "Nail Lamp",
        specification: "",
      },
      packing_snapshot: { description: "彩盒", carton_cbm: 0.15 },
      unit_price: 8,
    },
  ]);
  expect(model.items[0].specification).toBe("");
  expect(model.items[0].cartonCbm).toBe(0.15);
  expect(model.items[0].unitPrice).toBe(8);
});

it.each([undefined, null, "", "   "])(
  "never substitutes packaging for blank saved specification %s",
  (specification) => {
    const cases = [
      ["RYP010", "散装"],
      ["RYP031", "散装"],
      ["RNB001", "10个/OPP袋"],
      ["NC008", "瓶装"],
      ["NC010", "彩盒包装"],
      ["RDT001", "包装描述"],
      ["MG03", "备用描述"],
    ];
    for (const language of [undefined, "zh", "en", "es", "pt-BR"]) {
      const model = normalizeQuoteExportModel(
        { document_language: language },
        cases.map(([sku, description]) => ({
          sku,
          unit_price: 8.25,
          product_snapshot: {
            name: sku,
            specification,
            ...(language ? { language } : {}),
          },
          packing_snapshot: {
            description,
            qty_per_carton: 24,
            carton_cbm: 0.15,
          },
        })),
      );
      expect(model.items.map((item) => item.specification)).toEqual(
        cases.map(() => ""),
      );
      expect(
        model.items.every(
          (item) =>
            item.qtyPerCarton === 24 &&
            item.cartonCbm === 0.15 &&
            item.unitPrice === 8.25,
        ),
      ).toBe(true);
    }
  },
);
