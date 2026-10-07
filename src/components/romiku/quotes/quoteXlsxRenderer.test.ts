import { expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import websiteTemplateUrl from "@/assets/quote-templates/ROMIKU_报价单_网站询盘来源模板.xlsx?url";
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

it.each([1, 5, 20])(
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
    const sheet = workbook.getWorksheet("ROMIKU PI")!;
    const layout = buildQuoteTemplateLayout(count);
    const packageContents = await JSZip.loadAsync(output);
    const workbookXml = await packageContents
      .file("xl/workbook.xml")!
      .async("string");

    expect(layout).toEqual({ productStart: 9, lastProductRow: 8 + count });
    expect(sheet.getCell("H1").text).toContain("RFQ260930001\n2026.9.30");
    expect(sheet.getCell("C3").text).toBe("Saved Quote Seller");
    expect(sheet.getCell("B9").text).toBe("SKU-1");
    expect(sheet.getCell(`B${layout.lastProductRow}`).text).toBe(
      `SKU-${count}`,
    );
    expect(sheet.getCell("G9").numFmt).toBe("¥#,##0.00;[Red]-¥#,##0.00");
    expect(sheet.getCell("H9").value).toBe(0.06);
    expect(workbookXml).toMatch(
      new RegExp(
        `_xlnm\\.Print_Area[^>]*>[^<]*\\$A1:\\$H${layout.lastProductRow}`,
      ),
    );
    expect(workbookXml).toContain("&apos;ROMIKU PI&apos;!$1:$8");
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
    const sheet = workbook.getWorksheet("ROMIKU PI")!;

    expect(sheet.getCell("H9").value).toBe(cartonCbm);
    expect(sheet.getCell("H9").numFmt).toBe("0.000");
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
  const sheet = workbook.getWorksheet("ROMIKU PI")!;

  expect(sheet.columnCount).toBe(8);
  expect(sheet.getCell("G9").value).toBe(0.7386);
  expect(sheet.getCell("G9").numFmt).toBe("$#,##0.00;[Red]-$#,##0.00");
  expect(sheet.getCell("I9").value).toBeNull();
});

it.each([1, 5, 20])(
  "preserves both fixed template packages, buyer snapshots and requested quantities for %i rows",
  async (count) => {
    for (const website of [false, true]) {
      const template = await fetch(
        website ? websiteTemplateUrl : templateUrl,
      ).then((r) => r.arrayBuffer());
      const sourceWorkbook = new ExcelJS.Workbook();
      await sourceWorkbook.xlsx.load(template);
      const sourceSheet = sourceWorkbook.worksheets[0];
      const model = normalizeQuoteExportModel(
        {
          document_number: "RFQ261006099",
          document_date: "2026-10-06",
          source_website_inquiry_id: website ? "WI" : null,
          counterparty_snapshot: {
            company: "ABC Nails",
            contact_name: "Anna",
            whatsapp: "+57 300 123 4567",
            email: "anna@example.test",
          },
        },
        Array.from({ length: count }, (_, i) => ({
          ...item(i + 1),
          requested_quantity_snapshot: i === 1 ? null : 120.125,
        })),
      );
      const imageBytes = Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8h8AAAAASUVORK5CYII=",
        ),
        (c) => c.charCodeAt(0),
      );
      const output = await renderQuoteXlsx(model, template, {
        prepareImage: async (_url, row) => ({
          row,
          width: 1,
          height: 1,
          extension: "png",
          buffer: imageBytes.buffer,
        }),
      });
      const w = new ExcelJS.Workbook();
      await w.xlsx.load(output);
      const sh = w.worksheets[0];
      const end = website ? 9 : 8;
      expect(sh.name).toBe("ROMIKU PI");
      expect(sh.getCell(1, end).text).toBe("RFQ261006099\n2026.10.6");
      expect(sh.getCell("F3").text).toBe("ABC Nails\nAnna");
      expect(sh.getCell("F5").text).toBe("+57 300 123 4567");
      expect(sh.getCell("F7").text).toBe("anna@example.test");
      expect(sh.getCell(8, website ? 6 : 5).text).toBe(
        sourceSheet.getCell(8, website ? 6 : 5).text,
      );
      if (website) {
        expect(sh.getCell("F9").value).toBe(120.125);
        if (count > 1) expect(sh.getCell("F10").value).toBeNull();
      }
      expect(sh.getCell(9, end - 2).value).toBe(12);
      expect(sh.getCell(9, end - 1).value).toBe(1.5);
      expect(sh.getCell(9, end).value).toBe(0.06);
      for (let c = 1; c <= end; c++) {
        expect(sh.getColumn(c).width).toBe(sourceSheet.getColumn(c).width);
        for (let index = 0; index < count; index++) {
          const original = sourceSheet.getCell(
            index === count - 1 ? 12 : index === 0 ? 9 : 10,
            c,
          );
          const cell = sh.getCell(9 + index, c);
          expect(cell.font).toEqual(original.font);
          expect(cell.fill).toEqual(original.fill);
          expect(cell.border).toEqual(original.border);
          expect(cell.alignment).toEqual(original.alignment);
        }
      }
      expect(sh.getRow(9).height).toBe(
        sourceSheet.getRow(count === 1 ? 12 : 9).height,
      );
      expect(sh.model.merges).toEqual(
        sourceSheet.model.merges.filter((r) => !r.includes("13")),
      );
      const [original, rendered] = await Promise.all([
        JSZip.loadAsync(template),
        JSZip.loadAsync(output),
      ]);
      for (const path of ["xl/theme/theme1.xml", "xl/media/image1.png"]) {
        if (original.file(path))
          expect(await rendered.file(path)!.async("base64")).toBe(
            await original.file(path)!.async("base64"),
          );
      }
      const originalDrawing = await original
        .file("xl/drawings/drawing1.xml")!
        .async("string");
      const drawing = await rendered
        .file("xl/drawings/drawing1.xml")!
        .async("string");
      expect(drawing).toContain(
        originalDrawing.match(
          /<xdr:twoCellAnchor\b[\s\S]*?<\/xdr:twoCellAnchor>/,
        )![0],
      );
      expect([...drawing.matchAll(/name="Product image /g)]).toHaveLength(
        count,
      );
      expect(drawing).toContain(`<xdr:row>${7 + count}</xdr:row>`);
      expect(sh.pageSetup.printArea).toBe(
        `A1:${website ? "I" : "H"}${8 + count}`,
      );
    }
  },
);
