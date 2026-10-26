import { expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import templateUrl from "@/assets/order-templates/ROMIKU_订单_模板.xlsx?url";
import { normalizeOrderExportModel } from "./orderExportModel";
import { buildOrderTemplateLayout, renderOrderXlsx } from "./orderXlsxRenderer";

it("copies the product row height from the fixed template", async () => {
  const model = normalizeOrderExportModel({ document_number: "RCI260928001" }, [
    {
      id: "template-height",
      sku: "TEMPLATE-HEIGHT",
      quantity: 1,
      unit_price: 1,
      product_snapshot: {},
      packing_snapshot: {},
    },
  ]);
  const source = new ExcelJS.Workbook();
  await source.xlsx.load(
    await fetch(templateUrl).then((response) => response.arrayBuffer()),
  );
  source.worksheets[0].getRow(10).height = 71;
  const output = await renderOrderXlsx(model, await source.xlsx.writeBuffer());
  const rendered = new ExcelJS.Workbook();
  await rendered.xlsx.load(output);
  expect(rendered.getWorksheet("ORDER")!.getRow(10).height).toBe(71);
});

it("prints only the selected item number without changing the fixed workbook layout", async () => {
  const template = await fetch(templateUrl).then((response) =>
    response.arrayBuffer(),
  );
  const items = [
    {
      id: "a",
      sku: "OUR-A",
      customer_code: "BUYER-A",
      quantity: 2,
      unit_price: 3,
      product_snapshot: { name: "Saved name" },
      packing_snapshot: { cartons: 1, qty_per_carton: 2 },
    },
  ];
  const visible = normalizeOrderExportModel(
    { terms_snapshot: { order_export: { customer_code_visible: true } } },
    items,
  );
  const hidden = normalizeOrderExportModel(
    { terms_snapshot: { order_export: { customer_code_visible: false } } },
    items,
  );
  const visibleBook = new ExcelJS.Workbook();
  const hiddenBook = new ExcelJS.Workbook();
  await visibleBook.xlsx.load(await renderOrderXlsx(visible, template));
  await hiddenBook.xlsx.load(await renderOrderXlsx(hidden, template));
  const shown = visibleBook.worksheets[0];
  const original = hiddenBook.worksheets[0];
  expect(shown.getCell("B10").text).toBe("BUYER-A");
  expect(original.getCell("B10").text).toBe("OUR-A");
  expect(shown.getRow(10).height).toBe(original.getRow(10).height);
  expect(shown.getCell("B10").alignment).toEqual(
    original.getCell("B10").alignment,
  );
  expect(shown.getCell("B10").font).toEqual(original.getCell("B10").font);
  expect(shown.getCell("B10").border).toEqual(original.getCell("B10").border);
  for (const column of ["C", "E", "F", "G", "H", "I", "J"])
    expect(shown.getCell(`${column}10`).value).toEqual(
      original.getCell(`${column}10`).value,
    );
  expect(shown.getCell("H10").value).toBe(2);
  expect(shown.getCell("J10").value).toBe(6);
  expect(shown.columnCount).toBe(original.columnCount);
});

it("leaves ITEM.NO blank when a visible customer code is missing", async () => {
  const template = await fetch(templateUrl).then((response) =>
    response.arrayBuffer(),
  );
  const model = normalizeOrderExportModel(
    { terms_snapshot: { order_export: { customer_code_visible: true } } },
    [
      {
        id: "missing",
        sku: "OUR-A",
        customer_code: "  ",
        quantity: 1,
        unit_price: 1,
        product_snapshot: {},
        packing_snapshot: {},
      },
    ],
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await renderOrderXlsx(model, template));
  expect(workbook.worksheets[0].getCell("B10").text).toBe("");
});

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
  const termsTitle = buildOrderTemplateLayout(1, false).termsTitleRow;
  expect(Object.values(sheet.model.merges)).toContain(
    `A${termsTitle}:J${termsTitle}`,
  );
  expect(sheet.getCell(`B${termsTitle + 1}`).text).toContain("BANK CHARGES");
  expect(sheet.getCell(`A${termsTitle + 1}`).value).toBe(2);
  expect(sheet.getCell(`D${termsTitle + 1}`).text).not.toContain("Retained");
});

it("omits the complete Terms region and preserves the template Logo when terms are hidden", async () => {
  const model = normalizeOrderExportModel(
    {
      document_number: "OD260929009",
      terms_snapshot: { order_export: { terms_visible: false } },
    },
    [
      {
        id: "no-image",
        sku: "NO-IMAGE",
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
  const output = await renderOrderXlsx(model, template);
  const [source, rendered] = await Promise.all([
    JSZip.loadAsync(template),
    JSZip.loadAsync(output),
  ]);
  const sourceDrawing = await source
    .file("xl/drawings/drawing1.xml")!
    .async("string");
  const drawing = await rendered
    .file("xl/drawings/drawing1.xml")!
    .async("string");
  const workbookXml = await rendered.file("xl/workbook.xml")!.async("string");
  const sheet = new ExcelJS.Workbook();
  await sheet.xlsx.load(output);
  const orderSheet = sheet.getWorksheet("ORDER")!;
  const layout = buildOrderTemplateLayout(1, 0);

  expect(model.terms).toEqual([]);
  expect(layout.termRows).toEqual([]);
  expect(orderSheet.getCell(`A${layout.balanceRow + 1}`).text).not.toContain(
    "TERMS & CONDITIONS",
  );
  expect(workbookXml).toMatch(/_xlnm\.Print_Area[^>]*>[^<]*\$A1:\$J15/);
  expect(drawing).toContain(
    sourceDrawing.match(
      /<xdr:twoCellAnchor\b[\s\S]*?<\/xdr:twoCellAnchor>/,
    )![0],
  );
  expect(drawing).toContain('<a:srcRect t="32945" b="40175"/>');
  expect(
    Object.keys(rendered.files).filter(
      (path) => path.startsWith("xl/media/") && !rendered.files[path].dir,
    ),
  ).toHaveLength(1);
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
  expect(
    sheet.getCell(`D${buildOrderTemplateLayout(1, true).termRows[0]}`).text,
  ).toBe("Saved Order payment terms");
  expect(
    model.terms.find((term) => term.key === "bank_charges")?.text,
  ).toContain("outside China");
});

it("writes saved Order notes into the fixed REQUIREMENTS content area", async () => {
  const model = normalizeOrderExportModel(
    {
      document_number: "OD260928001",
      notes: "Use customer logo packaging.",
    },
    [],
  );
  const workbook = new ExcelJS.Workbook();
  const template = await fetch(templateUrl).then((response) =>
    response.arrayBuffer(),
  );
  await workbook.xlsx.load(await renderOrderXlsx(model, template));
  expect(workbook.worksheets[0].getCell("C8").text).toBe(
    "Use customer logo packaging.",
  );
});

it("preserves image aspect ratio when bitmap decoding is unavailable", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = 120;
  canvas.height = 60;
  canvas.getContext("2d")!.fillRect(0, 0, 120, 60);
  const bitmapDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "createImageBitmap",
  );
  Object.defineProperty(globalThis, "createImageBitmap", {
    configurable: true,
    value: undefined,
  });
  try {
    const model = normalizeOrderExportModel(
      { document_number: "RCI260923003" },
      [
        {
          id: "image-ratio",
          sku: "IMAGE-RATIO",
          quantity: 1,
          unit_price: 1,
          product_snapshot: { image_url: canvas.toDataURL("image/png") },
          packing_snapshot: {},
        },
      ],
    );
    const template = await fetch(templateUrl).then((response) =>
      response.arrayBuffer(),
    );
    const output = await renderOrderXlsx(model, template);
    const drawingXml = await JSZip.loadAsync(output).then((zip) =>
      zip.file("xl/drawings/drawing1.xml")!.async("string"),
    );
    const [, width, height] = drawingXml.match(
      /<xdr:oneCellAnchor\b[\s\S]*?<xdr:ext cx="(\d+)" cy="(\d+)"\/>/,
    )!;
    expect(Number(width) / Number(height)).toBeCloseTo(2, 3);
  } finally {
    if (bitmapDescriptor)
      Object.defineProperty(globalThis, "createImageBitmap", bitmapDescriptor);
    else
      delete (globalThis as { createImageBitmap?: unknown }).createImageBitmap;
  }
});

it.each([1, 2, 5, 8, 20, 30])(
  "rebuilds template merges and semantic rows for %i product rows",
  async (count) => {
    const imageCanvas = document.createElement("canvas");
    imageCanvas.width = 100;
    imageCanvas.height = 100;
    imageCanvas.getContext("2d")!.fillRect(0, 0, 100, 100);
    const testImage = imageCanvas.toDataURL("image/png");
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
          image_url: testImage,
        },
        packing_snapshot: { cartons: 1, qty_per_carton: 2 },
      })),
    );
    const template = await fetch(templateUrl).then((response) =>
      response.arrayBuffer(),
    );
    const sourceWorkbook = new ExcelJS.Workbook();
    await sourceWorkbook.xlsx.load(template);
    const sourceSheet = sourceWorkbook.worksheets[0];
    const output = await renderOrderXlsx(model, template);
    const [templateContents, packageContents] = await Promise.all([
      JSZip.loadAsync(template),
      JSZip.loadAsync(output),
    ]);
    const drawingXml = await packageContents
      .file("xl/drawings/drawing1.xml")!
      .async("string");
    const templateDrawingXml = await templateContents
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
    const summaryStart = 10 + count;
    const merges = Object.values(sheet.model.merges);
    expect(sheet.getCell(`B${9 + count}`).value).toBe(`SKU-${count}`);
    expect(sheet.getCell("J1").text).toContain("RCI260923001");
    expect(sheet.getCell("J1").text).toContain("2026.9.23");
    expect(merges).toContain(`A${summaryStart}:E${summaryStart}`);
    expect(merges).toContain(`G${summaryStart}:I${summaryStart}`);
    expect(merges).toContain(`A${summaryStart + 1}:I${summaryStart + 1}`);
    expect(merges).toContain(`A${summaryStart + 2}:I${summaryStart + 2}`);
    expect(merges).toContain(`A${summaryStart + 3}:I${summaryStart + 3}`);
    expect(merges).toContain(`A${summaryStart + 4}:I${summaryStart + 4}`);
    const termsTitle = summaryStart + 5;
    expect(merges).toContain(`A${termsTitle}:J${termsTitle}`);
    expect(merges).toContain(`B${termsTitle + 1}:C${termsTitle + 1}`);
    expect(merges).toContain(`D${termsTitle + 1}:J${termsTitle + 1}`);
    expect(sheet.getRow(10).height).toBe(sourceSheet.getRow(10).height);
    expect(sheet.getRow(summaryStart).height).toBe(
      sourceSheet.getRow(14).height,
    );
    expect(sheet.getRow(termsTitle).height).toBe(sourceSheet.getRow(19).height);
    expect(sheet.getRow(termsTitle + 1).height).toBe(
      sourceSheet.getRow(20).height,
    );
    expect(sheet.getCell(`A${termsTitle + 1}`).value).toBe(1);
    expect(sheet.getCell(`A${termsTitle + 8}`).value).toBe(8);
    expect(sheet.getCell(`A${summaryStart + 2}`).text).toContain(
      "TOTAL AMOUNT",
    );
    expect(sheet.getCell(`A${summaryStart + 2}`).text).not.toContain("OTHER");
    expect(sheet.getCell(`A${summaryStart + 2}`).text).not.toContain(
      "DISCOUNT",
    );
    expect(sheet.getCell("D10").value).toBeNull();
    expect(sheet.getCell("E10").value).toBe("Saved spec");
    expect(
      Object.keys(packageContents.files).filter(
        (path) =>
          path.startsWith("xl/media/") && !packageContents.files[path].dir,
      ),
    ).toHaveLength(count + 1);
    expect(drawingXml).toContain('<a:srcRect t="32945" b="40175"/>');
    const sourceLogoAnchor = templateDrawingXml.match(
      /<xdr:twoCellAnchor\b[\s\S]*?<\/xdr:twoCellAnchor>/,
    )?.[0];
    expect(sourceLogoAnchor).toBeDefined();
    expect(drawingXml).toContain(sourceLogoAnchor!);
    expect(drawingXml).toContain("Product image 1");
    expect(drawingXml.match(/<xdr:from><xdr:col>3<\/xdr:col>/g)).toHaveLength(
      count,
    );
    expect(drawingXml).toContain(`<xdr:row>${8 + count}</xdr:row>`);
    const productAnchors = [
      ...drawingXml.matchAll(
        /<xdr:oneCellAnchor\b[\s\S]*?<xdr:col>3<\/xdr:col><xdr:colOff>(\d+)<\/xdr:colOff>[\s\S]*?<xdr:rowOff>(\d+)<\/xdr:rowOff>[\s\S]*?<xdr:ext cx="(\d+)" cy="(\d+)"\/>/g,
      ),
    ];
    expect(productAnchors).toHaveLength(count);
    const photoCellWidth = Number(sourceSheet.getColumn(4).width) * 7 * 9_525;
    const photoCellHeight =
      Number(sourceSheet.getRow(10).height) * (96 / 72) * 9_525;
    const padding = 5 * 9_525;
    for (const anchor of productAnchors) {
      const [, colOff, rowOff, width, height] = anchor.map(Number);
      expect(colOff).toBeGreaterThanOrEqual(padding);
      expect(rowOff).toBeGreaterThanOrEqual(padding);
      expect(colOff + width).toBeLessThanOrEqual(photoCellWidth - padding);
      expect(rowOff + height).toBeLessThanOrEqual(photoCellHeight - padding);
      expect(width / height).toBeCloseTo(1, 3);
    }
    const productTransforms = [
      ...drawingXml.matchAll(
        /<xdr:oneCellAnchor\b[\s\S]*?<xdr:ext cx="(\d+)" cy="(\d+)"\/>[\s\S]*?<a:xfrm><a:off[^>]*\/><a:ext cx="(\d+)" cy="(\d+)"\/>/g,
      ),
    ];
    expect(productTransforms).toHaveLength(count);
    for (const transform of productTransforms) {
      const [, anchorWidth, anchorHeight, transformWidth, transformHeight] =
        transform.map(Number);
      expect(transformWidth).toBe(anchorWidth);
      expect(transformHeight).toBe(anchorHeight);
    }
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
    expect(
      await packageContents.file("xl/workbook.xml")!.async("string"),
    ).toContain("_xlnm.Print_Titles");
  },
);

it("changing internal document name leaves formal XLSX identity and template content unchanged", async () => {
  const header = {
    document_number: "OD261026001",
    document_date: "2026-10-31",
    counterparty_snapshot: { name: "Buyer", brand: "HISTORICAL BRAND" },
  };
  const rows = [
    {
      id: "name-test-line",
      sku: "005",
      customer_code: "BUYER-005",
      quantity: 2,
      unit_price: 5.5,
      position: 1,
      product_snapshot: { name: "Product" },
      packing_snapshot: {},
    },
  ];
  const before = normalizeOrderExportModel(header, rows);
  const after = normalizeOrderExportModel(
    { ...header, document_name: "Marianne 美甲灯 Tú" },
    rows,
  );
  expect(after).toEqual(before);
  const template = await fetch(templateUrl).then((r) => r.arrayBuffer());
  const output = await renderOrderXlsx(after, template);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(output);
  expect(workbook.worksheets[0].getCell("J1").text).toContain("OD261026001");
  expect(workbook.worksheets[0].getCell("J1").text).not.toContain("Marianne");
});
