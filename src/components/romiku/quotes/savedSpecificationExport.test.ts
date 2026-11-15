import { expect, it } from "vitest";
import { normalizeQuoteExportModel } from "./quoteExportModel";
import { normalizePiExportModel } from "../orders/piExportModel";
import { normalizeOrderExportModel } from "../orders/orderExportModel";
import { normalizePackingExportModel } from "../packing/packingExportModel";
import { normalizeProductionExportModel } from "../production/productionExportModel";

it.each([
  undefined,
  null,
  "",
  "人工规格 120W",
  "Manual 120W",
  "Especificación manual 120W",
  "Especificação manual 120W",
])("all document exports honor the saved specification %s", (specification) => {
  const item = {
    id: "saved-spec-test",
    sku: "RYP010",
    quantity: 2,
    unit_price: 8.25,
    position: 1,
    product_snapshot: { name: "Saved name", specification },
    packing_snapshot: {
      description: "散装",
      qty_per_carton: 24,
      carton_cbm: 0.15,
    },
    packaging_snapshot: { description: "散装" },
    production_note_zh: "Saved production note",
  };
  const expected = specification ?? "";
  for (const normalize of [
    normalizeQuoteExportModel,
    normalizePiExportModel,
    normalizeOrderExportModel,
    normalizePackingExportModel,
  ]) {
    expect(normalize({}, [item]).items[0].specification).toBe(expected);
  }
  // Production has a combined description column: retain its independent saved name/note.
  expect(normalizeProductionExportModel({}, [item]).items[0].description).toBe(
    ["Saved name", expected, "Saved production note"]
      .filter(Boolean)
      .join("\n"),
  );
  expect(item.packing_snapshot.description).toBe("散装");
});
