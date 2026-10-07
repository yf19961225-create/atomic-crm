import { expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import templateUrl from "@/assets/pi-templates/ROMIKU_PI_模板.xlsx?url";
import { normalizePiExportModel } from "./piExportModel";
import { buildPiTemplateLayout, renderPiXlsx } from "./piXlsxRenderer";

const item = (index: number, imageUrl = "") => ({
  id: String(index),
  position: index,
  sku: `SKU-${index}`,
  quantity: 2,
  unit_price: 12.5,
  product_snapshot: {
    name: `Saved product ${index}`,
    specification: `Specification ${index}`,
    image_url: imageUrl,
  },
  packing_snapshot: { cartons: index, qty_per_carton: 2 },
});

it.each([
  [1, true, true, 30],
  [3, true, true, 32],
  [20, false, true, 40],
  [1, false, false, 14],
])(
  "plans dynamic PI rows for %i products and visible blocks",
  (itemCount, termsVisible, bankVisible, lastRow) => {
    const layout = buildPiTemplateLayout(itemCount, termsVisible, bankVisible);
    expect(layout.summaryStart).toBe(9 + Math.max(1, itemCount));
    expect(layout.lastRow).toBe(lastRow);
    expect(layout.termRows).toHaveLength(termsVisible ? 8 : 0);
    expect(layout.bankRows).toHaveLength(bankVisible ? 6 : 0);
  },
);

it.each([1, 5, 20])(
  "renders %i saved PI products, split, CNY formats and drawings",
  async (count) => {
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 60;
    canvas.getContext("2d")!.fillRect(0, 0, 120, 60);
    const model = normalizePiExportModel(
      {
        document_number: "PI260930001",
        document_date: "2026-09-30",
        currency: "CNY",
        total: 100,
        freight: 25,
        deposit_percent: 40,
        counterparty_snapshot: {
          name: "Saved buyer",
          shipping_address: "Buyer address",
        },
        terms_snapshot: {
          pi_export: { seller: { company_name: "Saved seller" } },
        },
        bank_snapshot: { bank_name: "Saved bank" },
      },
      Array.from({ length: count }, (_, index) =>
        item(
          index + 1,
          index === 0 ? canvas.toDataURL("image/png") : undefined,
        ),
      ),
    );
    const template = await fetch(templateUrl).then((response) =>
      response.arrayBuffer(),
    );
    const output = await renderPiXlsx(model, template);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(output);
    const sheet = workbook.getWorksheet("ROMIKU PI")!;
    const layout = buildPiTemplateLayout(count, true, true);
    const merges = Object.values(sheet.model.merges);
    const packageContents = await JSZip.loadAsync(output);
    const drawing = await packageContents
      .file("xl/drawings/drawing1.xml")!
      .async("string");
    const workbookXml = await packageContents
      .file("xl/workbook.xml")!
      .async("string");

    expect(sheet.getCell("J1").text).toContain("PI260930001\n2026.9.30");
    expect(sheet.getCell("C3").text).toBe("Saved seller");
    expect(sheet.getCell("H3").text).toBe("Saved buyer");
    expect(sheet.getCell("B9").text).toBe("SKU-1");
    expect(sheet.getCell("J9").numFmt).toBe("¥#,##0.00;[Red]-¥#,##0.00");
    expect(sheet.getCell(`A${layout.depositRow}`).text).toContain("40%");
    expect(sheet.getCell(`J${layout.depositRow}`).value).toBe(40);
    expect(sheet.getCell(`A${layout.balanceRow}`).text).toContain("60%");
    expect(sheet.getCell(`J${layout.balanceRow}`).value).toBe(60);
    expect(sheet.getCell(`C${layout.bankRows[2]}`).text).toBe("Saved bank");
    expect(merges).toContain(`A${layout.summaryStart}:E${layout.summaryStart}`);
    expect(merges).toContain(`G${layout.summaryStart}:I${layout.summaryStart}`);
    expect(merges).toContain(
      `A${layout.termsTitleRow}:J${layout.termsTitleRow}`,
    );
    expect(merges).toContain(
      `A${layout.bankingTitleRow}:J${layout.bankingTitleRow}`,
    );
    expect(workbookXml).toContain(`$A1:$J${layout.lastRow}`);
    expect(drawing).toContain("Product image 1");
    expect(drawing.match(/<xdr:from><xdr:col>3<\/xdr:col>/g)).toHaveLength(1);
    expect(
      Object.keys(packageContents.files).filter(
        (path) =>
          path.startsWith("xl/media/") && !packageContents.files[path].dir,
      ),
    ).toHaveLength(2);
  },
);

it("removes whole Terms and Banking regions without deleting saved data", async () => {
  const model = normalizePiExportModel(
    {
      document_number: "PI260930002",
      total: 10,
      terms_snapshot: { pi_export: { terms_visible: false } },
      bank_snapshot: { bank_information_visible: false },
    },
    [],
  );
  const template = await fetch(templateUrl).then((response) =>
    response.arrayBuffer(),
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await renderPiXlsx(model, template));
  const sheet = workbook.getWorksheet("ROMIKU PI")!;
  const layout = buildPiTemplateLayout(0, false, false);

  expect(model.terms).toEqual([]);
  expect(layout.lastRow).toBe(layout.balanceRow);
  expect(sheet.getCell(`A${layout.balanceRow + 1}`).text).not.toContain(
    "TERMS",
  );
  expect(sheet.getCell(`A${layout.balanceRow + 1}`).text).not.toContain(
    "BANKING",
  );
});
