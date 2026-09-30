import { expect, it } from "vitest";
import { normalizePiExportModel } from "./piExportModel";

it("normalizes a PI from saved snapshots with a non-30% payment split", () => {
  const model = normalizePiExportModel(
    {
      document_number: "PI260930001",
      document_date: "2026-09-30",
      currency: "CNY",
      total: 123.45,
      freight: 8.45,
      deposit_percent: 40,
      counterparty_snapshot: {
        name: "Saved buyer",
        shipping_address: "Saved address",
        whatsapp: "+86 1",
      },
      terms_snapshot: {
        pi_export: {
          seller: { company_name: "Saved seller" },
          terms: { payment: { text: "Saved PI terms" } },
        },
      },
      bank_snapshot: {
        bank_name: "Saved bank",
        bank_information_visible: false,
      },
    },
    [
      {
        id: "later",
        position: 2,
        sku: "B",
        quantity: 2,
        unit_price: 10,
        product_snapshot: { name: "Saved B" },
        packing_snapshot: { cartons: 3, qty_per_carton: 2 },
      },
      {
        id: "first",
        position: 1,
        sku: "A",
        quantity: 3,
        unit_price: 7,
        product_snapshot: {
          name: "Saved A",
          image_url: "data:image/png;base64,abc",
          specification: "Saved specification",
        },
        packing_snapshot: { cartons: 2, qty_per_carton: 3 },
      },
    ],
  );

  expect(model.document).toEqual({ number: "PI260930001", date: "2026-09-30" });
  expect(model.currency).toBe("CNY");
  expect(model.seller.company_name).toBe("Saved seller");
  expect(model.buyer).toMatchObject({
    company_name: "Saved buyer",
    address: "Saved address",
    tel_whatsapp: "+86 1",
  });
  expect(model.items.map((item) => item.sku)).toEqual(["A", "B"]);
  expect(model.items[0]).toMatchObject({
    position: 1,
    amount: 21,
    imageUrl: "data:image/png;base64,abc",
    specification: "Saved specification",
  });
  expect(model.totals).toEqual({
    totalCtn: 5,
    subtotal: 41,
    freight: 8.45,
    total: 123.45,
  });
  expect(model.payment).toEqual({
    depositPercent: 40,
    deposit: 49.38,
    balance: 74.07,
  });
  expect(model.termsVisible).toBe(true);
  expect(model.bankInformationVisible).toBe(false);
  expect(model.bank.bank_name).toBe("Saved bank");
});

it("uses saved total and omits the complete hidden Terms and Banking regions", () => {
  const model = normalizePiExportModel(
    {
      total: 75,
      freight: 5,
      other_expenses: 100,
      discount: 20,
      deposit_percent: 0,
      terms_snapshot: { pi_export: { terms_visible: false } },
      bank_snapshot: { bank_information_visible: false },
    },
    [],
  );

  expect(model.totals).toMatchObject({ subtotal: 0, freight: 5, total: 75 });
  expect(model.payment).toMatchObject({ deposit: 0, balance: 75 });
  expect(model.termsVisible).toBe(false);
  expect(model.terms).toEqual([]);
  expect(model.bankInformationVisible).toBe(false);
});
