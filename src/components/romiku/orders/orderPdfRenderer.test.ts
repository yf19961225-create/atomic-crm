import { expect, it } from "vitest";
import { normalizeOrderExportModel } from "./orderExportModel";
import { renderOrderPdf } from "./orderPdfRenderer";

it("renders bilingual saved snapshots to a direct vector PDF", async () => {
  const model = normalizeOrderExportModel(
    {
      document_number: "RCI260923001",
      counterparty_snapshot: { name: "义乌客户" },
    },
    [
      {
        id: "1",
        sku: "SUN5",
        quantity: 1,
        unit_price: 10,
        product_snapshot: { name: "美甲灯", specification: "48W 插电" },
        packing_snapshot: {},
      },
    ],
  );
  const pdf = await renderOrderPdf(model);
  expect(pdf.slice(0, 4)).toEqual(new Uint8Array([37, 80, 68, 70]));
  expect(pdf.byteLength).toBeGreaterThan(1000);
});
