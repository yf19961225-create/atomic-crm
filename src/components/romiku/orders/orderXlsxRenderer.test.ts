import { expect, it } from "vitest";
import ExcelJS from "exceljs";
import templateUrl from "@/assets/order-templates/ROMIKU_订单_模板.xlsx?url";
import { normalizeOrderExportModel } from "./orderExportModel";
import { renderOrderXlsx } from "./orderXlsxRenderer";

it("renders saved Order snapshots into ORDER and shifts totals for dynamic rows", async () => {
  const model = normalizeOrderExportModel(
    {
      document_number: "RCI260923001",
      document_date: "2026-09-23",
      currency: "USD",
      freight: 2,
      other_expenses: 3,
      discount: 1,
      deposit_percent: 20,
      counterparty_snapshot: { name: "Saved Buyer" },
    },
    Array.from({ length: 6 }, (_, index) => ({
      id: String(index),
      position: index + 1,
      sku: `SKU-${index + 1}`,
      quantity: 2,
      unit_price: 5,
      product_snapshot: {
        name: `Saved ${index + 1}`,
        specification: "Saved spec",
      },
      packing_snapshot: { cartons: 1, qty_per_carton: 2 },
    })),
  );
  const template = await fetch(templateUrl).then((response) =>
    response.arrayBuffer(),
  );
  const output = await renderOrderXlsx(model, template);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(output);
  const sheet = workbook.getWorksheet("ORDER")!;
  expect(sheet.getCell("J1").text).toContain("RCI260923001");
  expect(sheet.getCell("B14").value).toBe("SKU-6");
  expect(sheet.getCell("A15").text).toContain("SUBTOTAL");
  expect(sheet.getCell("A17").text).toContain("OTHER EXPENSES");
  expect(sheet.getCell("A18").text).toContain("DISCOUNT");
});
