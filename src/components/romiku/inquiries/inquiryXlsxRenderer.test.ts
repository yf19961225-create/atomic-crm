import { expect, it } from "vitest";
import ExcelJS from "exceljs";
import templateUrl from "@/assets/inquiry-templates/ROMIKU_网站询盘_模板.xlsx?url";
import {
  normalizeInquiryExportModel,
  renderInquiryXlsx,
} from "./inquiryXlsxRenderer";

it.each([1, 5, 20])(
  "renders %i saved Inquiry items without prices or live lookups",
  async (count) => {
    const model = normalizeInquiryExportModel(
      {
        document_number: "WI-000123",
        customer_name: "Anna",
        company: "ABC Nails",
        whatsapp: "+57 300 123 4567",
        email: "qa@example.test",
        submitted_at: "2026-09-28T02:00:00Z",
        created_at: "2026-10-06T00:00:00Z",
      },
      Array.from({ length: count }, (_, i) => ({
        position: i + 1,
        sku: i === 0 ? "SUN5" : "G03",
        quantity: i === 0 ? 120 : 600,
        unit_price: 99,
        product_snapshot: {
          name: "Saved product",
          specification: "Saved spec",
          cartonQty: 32,
          carton_cbm: i === 0 ? 0.125 : null,
        },
      })),
    );
    expect(model.document.date).toBe("2026-09-28");
    const template = await fetch(templateUrl).then((r) => r.arrayBuffer());
    const source = new ExcelJS.Workbook();
    await source.xlsx.load(template);
    const result = await renderInquiryXlsx(model, template, {
      prepareImage: async () => undefined,
    });
    const w = new ExcelJS.Workbook();
    await w.xlsx.load(result);
    const s = w.worksheets[0];
    expect(s.name).toBe("ROMIKU PI");
    expect(s.getCell("H1").text).toContain("INQUIRY.NO");
    expect(s.getCell("I1").text).toBe("WI-000123\n2026.9.28");
    expect(s.getCell("F3").text).toBe("ABC Nails\nAnna");
    expect(s.getCell("F4").value).toBeNull();
    expect(s.getCell("F6").value).toBeNull();
    for (let r = 3; r <= 7; r++)
      expect(s.getCell(r, 3).value).toEqual(
        source.worksheets[0].getCell(r, 3).value,
      );
    for (let i = 0; i < count; i++) {
      expect(s.getCell(9 + i, 6).value).toBe(i === 0 ? 120 : 600);
      expect(s.getCell(9 + i, 7).value).toBe(32);
      expect(s.getCell(9 + i, 8).value).toBeNull();
      expect(s.getCell(9 + i, 9).value).toBe(i === 0 ? 0.125 : null);
    }
    expect(s.pageSetup.printArea).toBe(`A1:I${8 + count}`);
  },
);

it("preserves unknown packing values as blanks and contact without a company", () => {
  const model = normalizeInquiryExportModel(
    { customer_name: "Anna", submitted_at: "2025-01-01" },
    [{ sku: "OLD", quantity: 12.25, product_snapshot: { name: "Historical" } }],
  );
  expect(model.buyer.company_name).toBe("Anna");
  expect(model.items[0]).toMatchObject({
    requestedQuantity: 12.25,
    qtyPerCarton: null,
    cartonCbm: null,
    unitPrice: null,
  });
});

it("exports the saved Asia/Shanghai business date across a UTC day boundary", async () => {
  const model = normalizeInquiryExportModel(
    { document_number: "WI-000124", submitted_at: "2026-10-06T18:30:00Z" },
    [{ sku: "SUN5", quantity: 120, product_snapshot: { name: "Lamp" } }],
  );
  expect(model.document.date).toBe("2026-10-07");
  const template = await fetch(templateUrl).then((response) =>
    response.arrayBuffer(),
  );
  const output = await renderInquiryXlsx(model, template, {
    prepareImage: async () => undefined,
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(output);
  expect(workbook.worksheets[0].getCell("I1").text).toBe(
    "WI-000124\n2026.10.7",
  );
  expect(
    normalizeInquiryExportModel({ submitted_at: "2026-10-06" }, []).document
      .date,
  ).toBe("2026-10-06");
});
