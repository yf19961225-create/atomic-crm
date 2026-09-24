import { expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import templateUrl from "@/assets/order-templates/ROMIKU_订单_模板.xlsx?url";
import { normalizeOrderExportModel } from "./orderExportModel";
import { renderOrderXlsx } from "./orderXlsxRenderer";

it("removes the payment term row and closes the Terms gap when hidden", async () => {
  const model = normalizeOrderExportModel(
    {
      document_number: "RCI260923001",
      terms_snapshot: {
        order_export: {
          terms: { payment: { visible: false, text: "Retained but hidden" } },
        },
      },
    },
    [
      {
        id: "1",
        sku: "A",
        quantity: 1,
        unit_price: 1,
        product_snapshot: {},
        packing_snapshot: {},
      },
    ],
  );
  const template = await fetch(templateUrl).then((response) =>
    response.arrayBuffer(),
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await renderOrderXlsx(model, template));
  const sheet = workbook.getWorksheet("ORDER")!;
  const termsTitle = 15;
  expect(Object.values(sheet.model.merges)).toContain(
    `A${termsTitle}:J${termsTitle}`,
  );
  expect(sheet.getCell(`B${termsTitle + 1}`).text).toContain("BANK CHARGES");
  expect(sheet.getCell(`A${termsTitle + 1}`).value).toBe(2);
  expect(sheet.getCell(`D${termsTitle + 1}`).text).not.toContain("Retained");
});

it("exports a saved Order-level Terms override without changing the defaults", async () => {
  const model = normalizeOrderExportModel(
    {
      document_number: "RCI260923002",
      terms_snapshot: {
        order_export: {
          terms: { payment: { text: "Saved Order payment terms" } },
        },
      },
    },
    [
      {
        id: "1",
        sku: "A",
        quantity: 1,
        unit_price: 1,
        product_snapshot: {},
        packing_snapshot: {},
      },
    ],
  );
  const template = await fetch(templateUrl).then((response) =>
    response.arrayBuffer(),
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await renderOrderXlsx(model, template));
  const sheet = workbook.getWorksheet("ORDER")!;
  expect(sheet.getCell("D16").text).toBe("Saved Order payment terms");
  expect(
    model.terms.find((term) => term.key === "bank_charges")?.text,
  ).toContain("outside China");
});

it.each([1, 2, 8])(
  "rebuilds template merges and semantic rows for %i product rows",
  async (count) => {
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
      Array.from({ length: count }, (_, index) => ({
        id: String(index),
        position: index + 1,
        sku: `SKU-${index + 1}`,
        quantity: 2,
        unit_price: 5,
        product_snapshot: {
          name: `Saved ${index + 1}`,
          specification: "Saved spec",
          image_url:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLk+wAAAABJRU5ErkJggg==",
        },
        packing_snapshot: { cartons: 1, qty_per_carton: 2 },
      })),
    );
    const template = await fetch(templateUrl).then((response) =>
      response.arrayBuffer(),
    );
    const output = await renderOrderXlsx(model, template);
    const [templateContents, packageContents] = await Promise.all([
      JSZip.loadAsync(template),
      JSZip.loadAsync(output),
    ]);
    const drawingXml = await packageContents
      .file("xl/drawings/drawing1.xml")!
      .async("string");
    const sheetXml = await packageContents
      .file("xl/worksheets/sheet1.xml")!
      .async("string");
    const templateSheetXml = await templateContents
      .file("xl/worksheets/sheet1.xml")!
      .async("string");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(output);
    const sheet = workbook.getWorksheet("ORDER")!;
    expect(sheet.getCell("J1").text).toContain("RCI260923001");
    const summaryStart = 9 + count;
    const merges = Object.values(sheet.model.merges);
    expect(sheet.getCell(`B${8 + count}`).value).toBe(`SKU-${count}`);
    expect(sheet.getCell("J1").text).toContain("RCI260923001");
    expect(sheet.getCell("J1").text).toContain("2026.9.23");
    expect(merges).toContain(`A${summaryStart}:E${summaryStart}`);
    expect(merges).toContain(`G${summaryStart}:I${summaryStart}`);
    expect(merges).toContain(`A${summaryStart + 1}:I${summaryStart + 1}`);
    expect(merges).toContain(`A${summaryStart + 2}:I${summaryStart + 2}`);
    expect(merges).toContain(`A${summaryStart + 3}:I${summaryStart + 3}`);
    expect(merges).toContain(`A${summaryStart + 4}:I${summaryStart + 4}`);
    expect(merges).toContain(`A${summaryStart + 5}:I${summaryStart + 5}`);
    expect(merges).toContain(`A${summaryStart + 6}:I${summaryStart + 6}`);
    const termsTitle = summaryStart + 7;
    expect(merges).toContain(`A${termsTitle}:J${termsTitle}`);
    expect(merges).toContain(`B${termsTitle + 1}:C${termsTitle + 1}`);
    expect(merges).toContain(`D${termsTitle + 1}:J${termsTitle + 1}`);
    expect(sheet.getRow(9).height).toBe(100);
    expect(sheet.getRow(summaryStart).height).toBe(35);
    expect(sheet.getRow(termsTitle).height).toBeCloseTo(23.2);
    expect(sheet.getRow(termsTitle + 1).height).toBe(70);
    expect(sheet.getCell(`A${termsTitle + 1}`).value).toBe(1);
    expect(sheet.getCell(`A${termsTitle + 8}`).value).toBe(8);
    expect(sheet.getCell(`A${summaryStart + 2}`).text).toContain("OTHER");
    expect(sheet.getCell("D9").value).toBeNull();
    expect(sheet.getCell("E9").value).toBe("Saved spec");
    expect(
      Object.keys(packageContents.files).filter(
        (path) =>
          path.startsWith("xl/media/") && !packageContents.files[path].dir,
      ),
    ).toHaveLength(count + 1);
    expect(drawingXml).toContain('<a:srcRect t="32945" b="40175"/>');
    expect(drawingXml).toContain('<a:ext cx="2562860" cy="694690"/>');
    expect(drawingXml).toContain("Product image 1");
    expect(drawingXml.match(/<xdr:from><xdr:col>3<\/xdr:col>/g)).toHaveLength(
      count,
    );
    expect(drawingXml).toContain(`<xdr:row>${8 + count - 1}</xdr:row>`);
    const columnWidths = (xml: string) =>
      [...xml.matchAll(/<col\b[^>]*\bwidth="([^"]+)"/g)].map(
        (match) => match[1],
      );
    expect(columnWidths(sheetXml)).toEqual(columnWidths(templateSheetXml));
    expect(sheetXml).toContain(
      '<pageSetup paperSize="9" orientation="portrait" horizontalDpi="300" verticalDpi="300"/>',
    );
    expect(sheetXml).toContain(
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>',
    );
    expect(sheetXml).toContain('zoomScale="85"');
    expect(sheetXml).toContain(
      '<printOptions horizontalCentered="1" verticalCentered="1"/>',
    );
    expect(sheetXml).not.toContain("fitToWidth");
    expect(sheetXml).not.toContain("fitToHeight");
  },
);
