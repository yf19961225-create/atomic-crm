import { expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import templateUrl from "@/assets/production-templates/ROMIKU生产单模板.xlsx?url";
import { normalizeProductionExportModel } from "./productionExportModel";
import { renderProductionXlsx } from "./productionXlsxRenderer";
const template = () => fetch(templateUrl).then((r) => r.arrayBuffer());
const item = (position: number) => ({
  position,
  id: String(position),
  sku: `SKU-${position}`,
  quantity: 150,
  packaging_snapshot: { cartons: 5, qty_per_carton: 32 },
  product_snapshot: { name: "Saved name", specification: "48W 24LEDS" },
  production_note_zh: "Factory description",
});
it.each([1, 5, 25])(
  "renders %i saved product rows and moves totals, requirements and merges",
  async (count) => {
    const source = await template();
    const model = normalizeProductionExportModel(
      {
        document_number: "OD261003001-P01",
        marking_snapshot: {
          front_mark: { mode: "text", text: "ABC NAILS\nMADE IN CHINA" },
          side_mark: { mode: "none", text: "HIDDEN" },
          small_label: { mode: "text", text: "Small label" },
          labeling_requirements: "Right corner",
          production_requirements: "Saved requirement",
        },
      },
      Array.from({ length: count }, (_, i) => item(i + 1)),
    );
    const out = await renderProductionXlsx(model, source);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(out);
    const sheet = book.getWorksheet("ROMIKU PI")!;
    expect(sheet.getCell("B2").text).toBe("ABC NAILS\nMADE IN CHINA");
    expect(sheet.getCell("C2").text).toBe("");
    expect(sheet.getCell("D2").text).toBe("Small label");
    expect(sheet.getCell("E2").text).toBe("Right corner");
    expect(sheet.getCell("D4").text).toBe(
      "Saved name\n48W 24LEDS\nFactory description",
    );
    expect(sheet.getCell("E4").value).toBe(5);
    expect(sheet.getCell("F4").value).toBe(32);
    expect(sheet.getCell("G4").value).toBe(150);
    expect(sheet.getCell(`B${count + 3}`).text).toBe(`SKU-${count}`);
    expect(sheet.getCell(`E${count + 4}`).value).toBe(5 * count);
    expect(sheet.getCell(`G${count + 4}`).value).toBe(150 * count);
    expect(sheet.getCell(`C${count + 5}`).text).toBe("Saved requirement");
    expect(sheet.model.merges).toEqual(
      expect.arrayContaining([
        "E1:G1",
        "E2:G2",
        `A${count + 4}:D${count + 4}`,
        `A${count + 5}:B${count + 5}`,
        `C${count + 5}:G${count + 5}`,
      ]),
    );
    const original = new ExcelJS.Workbook();
    await original.xlsx.load(source);
    expect(sheet.getRow(4).height).toBe(112);
    expect(sheet.getRow(count + 3).height).toBe(112);
    expect(sheet.getCell(`B${count + 3}`).style).toEqual(
      original.worksheets[0].getCell("B4").style,
    );
    const zip = await JSZip.loadAsync(out),
      src = await JSZip.loadAsync(source);
    const xml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    const sourceXml = await src
      .file("xl/worksheets/sheet1.xml")!
      .async("string");
    expect(xml.match(/<pageSetup\b[^>]*\/>/)?.[0]).toBe(
      sourceXml.match(/<pageSetup\b[^>]*\/>/)?.[0],
    );
    expect(await zip.file("xl/workbook.xml")!.async("string")).toContain(
      `$A1:$G${count + 5}`,
    );
    expect(xml).not.toContain("OD261003001-P01");
  },
);
it("embeds all marking images and product image using the shared contain anchors even without template drawing", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = 200;
  canvas.height = 100;
  canvas.getContext("2d")!.fillRect(0, 0, 200, 100);
  const url = canvas.toDataURL("image/png");
  const model = normalizeProductionExportModel(
    {
      marking_snapshot: {
        front_mark: { mode: "image" },
        side_mark: { mode: "image" },
        small_label: { mode: "image" },
      },
    },
    [{ ...item(1), product_snapshot: { image_url: url } }],
  );
  model.markingImages = { front_mark: url, side_mark: url, small_label: url };
  const zip = await JSZip.loadAsync(
    await renderProductionXlsx(model, await template()),
  );
  const drawing = await zip.file("xl/drawings/drawing1.xml")!.async("string");
  const doc = new DOMParser().parseFromString(drawing, "application/xml");
  const anchors = Array.from(doc.getElementsByTagName("xdr:oneCellAnchor"));
  expect(anchors).toHaveLength(4);
  const positions = anchors.map((a) => [
    a.getElementsByTagName("xdr:col")[0].textContent,
    a.getElementsByTagName("xdr:row")[0].textContent,
  ]);
  expect(positions).toEqual(
    expect.arrayContaining([
      ["1", "1"],
      ["2", "1"],
      ["3", "1"],
      ["2", "3"],
    ]),
  );
  for (const a of anchors) {
    const ext = a.getElementsByTagName("xdr:ext")[0];
    expect(
      Number(ext.getAttribute("cx")) / Number(ext.getAttribute("cy")),
    ).toBeCloseTo(2, 4);
    expect(
      Number(a.getElementsByTagName("xdr:colOff")[0].textContent),
    ).toBeGreaterThan(0);
    expect(
      Number(a.getElementsByTagName("xdr:rowOff")[0].textContent),
    ).toBeGreaterThan(0);
  }
  expect(await zip.file("[Content_Types].xml")!.async("string")).toContain(
    "/xl/drawings/drawing1.xml",
  );
  expect(
    await zip.file("xl/worksheets/_rels/sheet1.xml.rels")!.async("string"),
  ).toContain("../drawings/drawing1.xml");
  expect(await zip.file("xl/worksheets/sheet1.xml")!.async("string")).toContain(
    "<drawing ",
  );
  expect(
    Object.keys(zip.files).filter((f) => /^xl\/media\/image\d+\.png$/.test(f)),
  ).toHaveLength(4);
});
it("does not silently export a missing marking image", async () => {
  const model = normalizeProductionExportModel(
    { marking_snapshot: { front_mark: { mode: "image" } } },
    [item(1)],
  );
  await expect(renderProductionXlsx(model, await template())).rejects.toThrow(
    /正唛.*图片/,
  );
});
it("expands the existing requirement region for long text without adding a new region", async () => {
  const model = normalizeProductionExportModel(
    {
      marking_snapshot: {
        production_requirements: Array(20)
          .fill("One production instruction")
          .join("\n"),
      },
    },
    [item(1)],
  );
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await renderProductionXlsx(model, await template()));
  expect(book.worksheets[0].getRow(6).height).toBeGreaterThan(200);
  expect(book.worksheets[0].getCell("C6").text.split("\n")).toHaveLength(20);
});
it("wraps long labeling requirements inside E2:G2", async () => {
  const model = normalizeProductionExportModel(
    {
      marking_snapshot: {
        labeling_requirements:
          "将客户标签贴在每箱右上角，保持方向一致。".repeat(20),
      },
    },
    [item(1)],
  );
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await renderProductionXlsx(model, await template()));
  expect(book.worksheets[0].getCell("E2").alignment.wrapText).toBe(true);
  expect(book.worksheets[0].getRow(2).height).toBeGreaterThan(137);
});
