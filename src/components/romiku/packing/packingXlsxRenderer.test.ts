import { expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import templateUrl from "@/assets/packing-templates/ROMIKU_装箱单_模板.xlsx?url";
import { normalizePackingExportModel } from "./packingExportModel";
import {
  buildPackingTemplateLayout,
  renderPackingXlsx,
} from "./packingXlsxRenderer";

const item = (position: number, imageUrl = "") => ({
  id: String(position),
  position,
  sku: `SKU-${position}`,
  quantity: position * 10,
  cartons: position,
  qty_per_carton: 10,
  length_cm: 50,
  width_cm: 40,
  height_cm: 30,
  carton_weight_kg: 12.5,
  total_cbm: position * 0.06,
  total_weight_kg: position * 12.5,
  product_snapshot: {
    name: `Saved product ${position}`,
    specification: `Saved specification ${position}`,
    image_url: imageUrl,
    unit: "PCS",
  },
});

it.each([1, 4, 20])(
  "renders %i dynamic Packing rows and relocates totals",
  async (count) => {
    const template = await fetch(templateUrl).then((response) =>
      response.arrayBuffer(),
    );
    const output = await renderPackingXlsx(
      normalizePackingExportModel(
        {
          document_number: "PL-001",
          packing_at: "2026-10-02T00:00:00.000Z",
          seller_snapshot: { company_name: "Saved Seller" },
          buyer_snapshot: { company_name: "Saved Buyer" },
        },
        Array.from({ length: count }, (_, index) => item(index + 1)),
      ),
      template,
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(output);
    const sheet = workbook.getWorksheet("PACKING LIST")!;
    const layout = buildPackingTemplateLayout(count);
    const packageContents = await JSZip.loadAsync(output);
    const workbookXml = await packageContents
      .file("xl/workbook.xml")!
      .async("string");

    expect(layout).toEqual({
      productStart: 9,
      lastProductRow: 8 + count,
      totalsStart: 9 + count,
      lastSummaryRow: 11 + count,
    });
    expect(sheet.getCell("P1").text).toContain("PL-001\n2026.10.2");
    expect(sheet.getCell("C3").text).toBe("Saved Seller");
    expect(sheet.getCell("I3").text).toBe("Saved Buyer");
    expect(sheet.getCell("B9").text).toBe("SKU-1");
    expect(sheet.getCell(`B${layout.lastProductRow}`).text).toBe(
      `SKU-${count}`,
    );
    expect(sheet.getCell("M9").value).toBe(0.06);
    expect(sheet.getCell("F9").numFmt).toBe("0");
    expect(sheet.getCell("G9").numFmt).toBe("0");
    expect(sheet.getCell("I9").numFmt).toBe("0");
    expect(sheet.getCell("J9").value).toBe(50);
    expect(sheet.getCell("K9").value).toBe(40);
    expect(sheet.getCell("L9").value).toBe(30);
    expect(sheet.getCell("J9").numFmt).toBeUndefined();
    expect(sheet.getCell("K9").numFmt).toBeUndefined();
    expect(sheet.getCell("L9").numFmt).toBeUndefined();
    expect(sheet.getCell("M9").numFmt).toBe("0.000");
    expect(sheet.getCell("N9").numFmt).toBe("0.00");
    expect(sheet.getCell("O9").numFmt).toBe("0.000");
    expect(sheet.getCell("P9").numFmt).toBe("0.00");
    expect(sheet.getCell(`P${layout.totalsStart}`).value).toBe(
      (count * (count + 1)) / 2,
    );
    expect(workbookXml).toMatch(
      new RegExp(
        `_xlnm\\.Print_Area[^>]*>[^<]*\\$A1:\\$P${layout.lastSummaryRow}`,
      ),
    );
    expect(workbookXml).toContain("&apos;PACKING LIST&apos;!$1:$8");
  },
);

it("keeps decimal dimensions numeric without a trailing decimal format", async () => {
  const template = await fetch(templateUrl).then((response) =>
    response.arrayBuffer(),
  );
  const output = await renderPackingXlsx(
    normalizePackingExportModel({ document_number: "PL-DIMENSIONS" }, [
      {
        ...item(1),
        length_cm: 50.5,
        width_cm: 40.25,
        height_cm: 30,
      },
    ]),
    template,
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(output);
  const sheet = workbook.getWorksheet("PACKING LIST")!;

  expect(sheet.getCell("J9").value).toBe(50.5);
  expect(sheet.getCell("K9").value).toBe(40.25);
  expect(sheet.getCell("L9").value).toBe(30);
  expect(sheet.getCell("J9").numFmt).toBeUndefined();
  expect(sheet.getCell("K9").numFmt).toBeUndefined();
  expect(sheet.getCell("L9").numFmt).toBeUndefined();
});

it("preserves the cropped logo and appends a saved product photo drawing", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = 120;
  canvas.height = 60;
  canvas.getContext("2d")!.fillRect(0, 0, 120, 60);
  const template = await fetch(templateUrl).then((response) =>
    response.arrayBuffer(),
  );
  const output = await renderPackingXlsx(
    normalizePackingExportModel({ document_number: "PL-002" }, [
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
});
