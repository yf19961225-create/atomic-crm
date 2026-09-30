import { expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import templateUrl from "@/assets/quote-templates/ROMIKU_报价单_模板.xlsx?url";
import { normalizeQuoteExportModel } from "./quoteExportModel";
import { buildQuoteTemplateLayout, renderQuoteXlsx } from "./quoteXlsxRenderer";

const item = (position: number, imageUrl = "") => ({
  id: String(position),
  position,
  sku: `SKU-${position}`,
  unit_price: position + 0.5,
  product_snapshot: {
    name: `Saved product ${position}`,
    specification: `Saved spec ${position}`,
    image_url: imageUrl,
  },
  packing_snapshot: {
    qty_per_carton: position * 12,
    length_cm: 50,
    width_cm: 40,
    height_cm: 30,
  },
});

it.each([1, 4, 20])(
  "plans and renders exactly %i Quote product rows",
  async (count) => {
    const template = await fetch(templateUrl).then((response) =>
      response.arrayBuffer(),
    );
    const model = normalizeQuoteExportModel(
      {
        document_number: "RFQ260930001",
        document_date: "2026-09-30",
        currency: "CNY",
        terms_snapshot: {
          quote_export: { seller: { company_name: "Saved Quote Seller" } },
        },
      },
      Array.from({ length: count }, (_, index) => item(index + 1)),
    );
    const output = await renderQuoteXlsx(model, template);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(output);
    const sheet = workbook.getWorksheet("QUOTE")!;
    const layout = buildQuoteTemplateLayout(count);
    const packageContents = await JSZip.loadAsync(output);
    const workbookXml = await packageContents
      .file("xl/workbook.xml")!
      .async("string");

    expect(layout).toEqual({ productStart: 8, lastProductRow: 7 + count });
    expect(sheet.getCell("H1").text).toContain("RFQ260930001\n2026.9.30");
    expect(sheet.getCell("C2").text).toBe("Saved Quote Seller");
    expect(sheet.getCell("B8").text).toBe("SKU-1");
    expect(sheet.getCell(`B${layout.lastProductRow}`).text).toBe(
      `SKU-${count}`,
    );
    expect(sheet.getCell("G8").numFmt).toBe("¥#,##0.00;[Red]-¥#,##0.00");
    expect(sheet.getCell("H8").value).toBe(0.06);
    expect(workbookXml).toMatch(
      new RegExp(
        `_xlnm\\.Print_Area[^>]*>[^<]*\\$A1:\\$H${layout.lastProductRow}`,
      ),
    );
    expect(workbookXml).toContain("&apos;QUOTE&apos;!$1:$7");
  },
);

it("keeps the cropped template logo and appends a contained product drawing", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = 120;
  canvas.height = 60;
  canvas.getContext("2d")!.fillRect(0, 0, 120, 60);
  const template = await fetch(templateUrl).then((response) =>
    response.arrayBuffer(),
  );
  const output = await renderQuoteXlsx(
    normalizeQuoteExportModel({ document_number: "RFQ260930002" }, [
      item(1, canvas.toDataURL("image/png")),
    ]),
    template,
  );
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

  expect(drawing).toContain(
    sourceDrawing.match(
      /<xdr:twoCellAnchor\b[\s\S]*?<\/xdr:twoCellAnchor>/,
    )![0],
  );
  expect(drawing).toContain("Product image 1");
  expect(drawing).toContain("<xdr:col>3</xdr:col>");
  expect(drawing).toContain('noChangeAspect="1"');
  expect(
    Object.keys(rendered.files).filter(
      (path) => path.startsWith("xl/media/") && !rendered.files[path].dir,
    ),
  ).toHaveLength(2);
});

it.each([0.08, 0.125])(
  "writes the saved decimal CBM %s without integer rounding",
  async (cartonCbm) => {
    const template = await fetch(templateUrl).then((response) =>
      response.arrayBuffer(),
    );
    const output = await renderQuoteXlsx(
      normalizeQuoteExportModel({ document_number: "RFQ260930003" }, [
        {
          ...item(1),
          packing_snapshot: { qty_per_carton: 12, carton_cbm: cartonCbm },
        },
      ]),
      template,
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(output);
    const sheet = workbook.getWorksheet("QUOTE")!;

    expect(sheet.getCell("H8").value).toBe(cartonCbm);
    expect(sheet.getCell("H8").numFmt).toBe("0.000");
  },
);

it("exports only the saved final USD unit price without an FX column", async () => {
  const template = await fetch(templateUrl).then((response) =>
    response.arrayBuffer(),
  );
  const output = await renderQuoteXlsx(
    normalizeQuoteExportModel(
      { document_number: "RFQ260930004", currency: "USD" },
      [
        {
          ...item(1),
          unit_price: 0.7386,
        },
      ],
    ),
    template,
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(output);
  const sheet = workbook.getWorksheet("QUOTE")!;

  expect(sheet.columnCount).toBe(8);
  expect(sheet.getCell("G8").value).toBe(0.7386);
  expect(sheet.getCell("G8").numFmt).toBe("$#,##0.00;[Red]-$#,##0.00");
  expect(sheet.getCell("I8").value).toBeNull();
});
