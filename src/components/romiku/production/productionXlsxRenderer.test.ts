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
        "E1:H1",
        "E2:H2",
        `A${count + 4}:D${count + 4}`,
        `A${count + 5}:B${count + 5}`,
        `C${count + 5}:H${count + 5}`,
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
    expect(xml.match(/<pageSetup\b[^>]*\/>/)?.[0]).toContain('fitToWidth="1"');
    expect(xml.match(/<pageMargins\b[^>]*\/>/)?.[0]).toBe(
      sourceXml.match(/<pageMargins\b[^>]*\/>/)?.[0],
    );
    expect(await zip.file("xl/workbook.xml")!.async("string")).toContain(
      `$A1:$H${count + 5}`,
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
  model.items[0].smallLabelImage = url;
  const zip = await JSZip.loadAsync(
    await renderProductionXlsx(model, await template()),
  );
  const drawing = await zip.file("xl/drawings/drawing1.xml")!.async("string");
  const doc = new DOMParser().parseFromString(drawing, "application/xml");
  const anchors = Array.from(doc.getElementsByTagName("xdr:oneCellAnchor"));
  expect(anchors).toHaveLength(5);
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
      ["7", "3"],
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
  ).toHaveLength(5);
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

it.each([1, 5, 20])(
  "preserves the template requirements body and red title styles after %i product rows",
  async (count) => {
    const source = await template();
    const original = new ExcelJS.Workbook();
    await original.xlsx.load(source);
    const templateSheet = original.worksheets[0];
    expect(templateSheet.model.merges).toContain("C6:G6");
    const bodyStyle = structuredClone(templateSheet.getCell("C6").style);
    const titleStyle = structuredClone(templateSheet.getCell("A6").style);
    const model = normalizeProductionExportModel(
      {
        marking_snapshot: {
          production_requirements:
            "订单要求正文\nSaved production requirements",
        },
      },
      Array.from({ length: count }, (_, i) => item(i + 1)),
    );
    const exported = new ExcelJS.Workbook();
    await exported.xlsx.load(await renderProductionXlsx(model, source));
    const sheet = exported.worksheets[0];
    const body = sheet.getCell(`C${count + 5}`);
    expect(body.text).toBe("订单要求正文\nSaved production requirements");
    expect(sheet.model.merges).toContain(`C${count + 5}:H${count + 5}`);
    expect(body.font.name).toBe(bodyStyle.font?.name);
    expect(body.font.size).toBe(bodyStyle.font?.size);
    expect(body.font).toEqual(bodyStyle.font);
    expect(body.alignment).toEqual(bodyStyle.alignment);
    expect(body.alignment.wrapText).toBe(bodyStyle.alignment?.wrapText);
    expect(body.fill).toEqual(bodyStyle.fill);
    expect(body.border).toEqual(bodyStyle.border);
    expect(body.style).toEqual(bodyStyle);
    expect(sheet.getCell(`A${count + 5}`).style).toEqual(titleStyle);
    expect(sheet.getCell(`A${count + 5}`).text).toBe(
      templateSheet.getCell("A6").text,
    );
  },
);

it.each([1, 5, 20])(
  "exports %i mixed resolved small labels with bounded images and unchanged product/footer content",
  async (count) => {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 100;
    canvas.getContext("2d")!.fillRect(0, 0, 200, 100);
    const png = canvas.toDataURL("image/png");
    const model = normalizeProductionExportModel(
      {
        marking_snapshot: {
          front_mark: { mode: "text", text: "YUN SHANG" },
          side_mark: { mode: "text", text: "YUN SHANG" },
          small_label: { mode: "text", text: "Made in China" },
          production_requirements: "Bag",
        },
      },
      Array.from({ length: count }, (_, i) => ({
        ...item(i + 1),
        product_snapshot: { image_url: png, name: "Lamp" },
        marking_override:
          i % 4 === 0
            ? {
                field_overrides: {
                  small_label: {
                    mode: "override",
                    mark: {
                      mode: "image",
                      image_asset: {
                        bucket: "romiku-marking-assets",
                        path: "saved/label.png",
                      },
                    },
                  },
                },
              }
            : i % 4 === 1
              ? {
                  field_overrides: {
                    small_label: {
                      mode: "override",
                      mark: { mode: "text", text: "Barcode" },
                    },
                  },
                }
              : i % 4 === 2
                ? { field_overrides: { small_label: { mode: "none" } } }
                : { mode: "inherit" },
      })),
    );
    for (const row of model.items)
      if (row.smallLabel?.mode === "image") row.smallLabelImage = png;
    const out = await renderProductionXlsx(model, await template());
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(out);
    const sh = book.worksheets[0];
    expect(sh.getCell("H3").text).toBe("小标签");
    expect(sh.getCell("D1").text).toBe("统一小标签");
    expect(sh.getCell("B2").text).toBe("YUN SHANG");
    expect(sh.getCell("C2").text).toBe("YUN SHANG");
    expect(sh.getCell("D2").text).toBe("Made in China");
    for (let i = 0; i < count; i++) {
      expect(sh.getCell(`H${i + 4}`).text).toBe(
        i % 4 === 1 ? "Barcode" : i % 4 === 3 ? "Made in China" : "",
      );
      expect(sh.getCell(`H${i + 4}`).alignment).toMatchObject({
        wrapText: true,
        horizontal: "center",
        vertical: "middle",
      });
      expect(sh.getRow(i + 4).height).toBe(112);
    }
    expect(sh.getCell(`E${count + 4}`).value).toBe(5 * count);
    expect(sh.getCell(`G${count + 4}`).value).toBe(150 * count);
    expect(sh.getCell(`C${count + 5}`).text).toBe("Bag");
    const zip = await JSZip.loadAsync(out),
      xml = await zip.file("xl/drawings/drawing1.xml")!.async("string");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const anchors = Array.from(doc.getElementsByTagName("xdr:oneCellAnchor"));
    const labels = anchors.filter(
      (a) => a.getElementsByTagName("xdr:col")[0].textContent === "7",
    );
    expect(labels).toHaveLength(Math.ceil(count / 4));
    expect(
      anchors.filter(
        (a) => a.getElementsByTagName("xdr:col")[0].textContent === "2",
      ),
    ).toHaveLength(count);
    for (const a of labels) {
      const ext = a.getElementsByTagName("xdr:ext")[0];
      const width = Number(ext.getAttribute("cx")),
        height = Number(ext.getAttribute("cy"));
      const x = Number(a.getElementsByTagName("xdr:colOff")[0].textContent),
        y = Number(a.getElementsByTagName("xdr:rowOff")[0].textContent);
      expect(width / height).toBeCloseTo(2, 4);
      expect(x).toBeGreaterThan(0);
      expect(y).toBeGreaterThan(0);
      const cellWidth =
        Math.floor(
          ((256 * sh.getColumn(8).width! + Math.floor(128 / 7)) / 256) * 7,
        ) * 9525;
      expect(width + 2 * x).toBeLessThanOrEqual(cellWidth);
      expect(height + 2 * y).toBeLessThanOrEqual(112 * 12700);
      expect(width).toBeGreaterThan(100 * 9525);
    }
    expect(sh.pageSetup.printArea).toBe(`A1:H${count + 5}`);
    expect(sh.pageSetup.fitToWidth).toBe(1);
  },
);
