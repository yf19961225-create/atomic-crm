import ExcelJS from "exceljs";
import JSZip from "jszip";
import {
  applyStyle,
  captureStyle,
  clearResidualDynamicMerges,
  prepareProductImage,
  preserveTemplatePackage,
  unmerge,
  type PreparedProductImage,
} from "../orders/orderXlsxRenderer";
import { markingKeys } from "../marking/markingProfile";
import { markingLabels } from "../marking/markingAssets";
import type { ProductionExportModel } from "./productionExportModel";

const wrappedLines = (text: string, width: number) =>
  text
    .split("\n")
    .reduce(
      (sum, line) =>
        sum +
        Math.max(
          1,
          Math.ceil(
            [...line].reduce(
              (length, c) => length + (c.charCodeAt(0) > 255 ? 2 : 1),
              0,
            ) / width,
          ),
        ),
      0,
    );
/** The renderer consumes saved normalized values; it never queries source records. */
export async function renderProductionXlsx(
  model: ProductionExportModel,
  template: ArrayBuffer,
): Promise<ArrayBuffer> {
  if (!model.items.length)
    throw new Error("生产单没有已保存的产品项，无法导出。");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template);
  const sheet = workbook.worksheets[0];
  // Audited template: A:G, row 3 headers, row 4 product, C6:G6 requirements.
  // Extend this Production export only; the frozen commercial renderer is reused unchanged.
  const labelColumn = 8;
  sheet.getColumn(labelColumn).width = sheet.getColumn(3).width;
  for (const row of [1, 2, 3])
    sheet.getCell(row, labelColumn).style = structuredClone(
      sheet.getCell(row, 7).style,
    );
  sheet.getCell("H3").value = "小标签";
  sheet.getCell("D1").value = "统一小标签";
  for (const row of [1, 2]) {
    unmerge(sheet, `E${row}:G${row}`);
    sheet.mergeCells(`E${row}:H${row}`);
  }
  const product = captureStyle(sheet, 4, 7),
    footer = captureStyle(sheet, 5, 7),
    requirements = captureStyle(sheet, 6, 7);
  const labels = {
    cartons: sheet.getCell("A5").text,
    quantity: sheet.getCell("F5").text,
    requirements: sheet.getCell("A6").text,
  };
  for (const range of [...sheet.model.merges])
    if ((range.match(/\d+/g)?.map(Number) || []).some((row) => row >= 4))
      unmerge(sheet, range);
  const count = model.items.length,
    footerRow = 4 + count,
    requirementsRow = 5 + count;
  sheet.spliceRows(
    4,
    Math.max(3, sheet.rowCount - 3),
    ...Array.from({ length: count + 2 }, () => []),
  );
  clearResidualDynamicMerges(sheet, 4, Math.max(9, requirementsRow));
  model.items.forEach((item, index) => {
    const row = 4 + index;
    applyStyle(sheet, row, product, 7);
    [
      item.position,
      item.sku,
      null,
      item.description,
      item.cartons,
      item.qtyPerCarton,
      item.quantity,
    ].forEach((value, column) => {
      sheet.getCell(row, column + 1).value = value;
    });
    const labelCell = sheet.getCell(row, labelColumn);
    labelCell.style = structuredClone(sheet.getCell(row, 4).style);
    labelCell.alignment = {
      ...labelCell.alignment,
      wrapText: true,
      horizontal: "center",
      vertical: "middle",
    };
    labelCell.value =
      item.smallLabel.mode === "text" ? item.smallLabel.text : null;
    sheet.getRow(row).height = Math.max(
      product.height || 112,
      wrappedLines(item.description, 22) * 24 + 10,
      item.smallLabel.mode === "text"
        ? wrappedLines(item.smallLabel.text, 28) * 24 + 10
        : 0,
    );
  });
  applyStyle(sheet, footerRow, footer, 7);
  sheet.mergeCells(`A${footerRow}:D${footerRow}`);
  sheet.getCell(footerRow, 1).value = labels.cartons;
  sheet.getCell(footerRow, 5).value = model.totals.cartons;
  sheet.getCell(footerRow, 6).value = labels.quantity;
  sheet.getCell(footerRow, 7).value = model.totals.quantity;
  sheet.getCell(footerRow, 8).style = structuredClone(
    sheet.getCell(footerRow, 7).style,
  );
  sheet.mergeCells(`G${footerRow}:H${footerRow}`);
  applyStyle(sheet, requirementsRow, requirements, 7);
  sheet.mergeCells(`A${requirementsRow}:B${requirementsRow}`);
  sheet.getCell(requirementsRow, 8).style = structuredClone(
    sheet.getCell(requirementsRow, 7).style,
  );
  sheet.mergeCells(`C${requirementsRow}:H${requirementsRow}`);
  sheet.getCell(requirementsRow, 1).value = labels.requirements;
  sheet.getCell(requirementsRow, 3).value = model.requirements;
  sheet.getRow(requirementsRow).height = Math.max(
    requirements.height || 50,
    wrappedLines(model.requirements, 80) * 14 + 10,
  );
  const images: PreparedProductImage[] = [];
  for (const [index, key] of markingKeys.entries()) {
    const mark = model.marking[key],
      cell = sheet.getCell(2, index + 2);
    cell.value = mark.mode === "text" ? mark.text : null;
    cell.alignment = {
      ...cell.alignment,
      wrapText: true,
      horizontal: "center",
      vertical: "middle",
    };
    if (mark.mode === "text")
      sheet.getRow(2).height = Math.max(
        sheet.getRow(2).height || 137,
        wrappedLines(mark.text, 28) * 14 + 10,
      );
    if (mark.mode === "image") {
      const image = await prepareProductImage(
        model.markingImages[key] || "",
        2,
      );
      if (!image)
        throw new Error(
          `${markingLabels[key]}图片无法嵌入，请检查已保存图片后重试。`,
        );
      images.push({ ...image, column: index + 1 });
    }
  }
  sheet.getCell("E2").value = model.marking.labeling_requirements;
  sheet.getCell("E2").alignment = {
    ...sheet.getCell("E2").alignment,
    wrapText: true,
    horizontal: "center",
    vertical: "middle",
  };
  sheet.getRow(2).height = Math.max(
    sheet.getRow(2).height || 137,
    wrappedLines(model.marking.labeling_requirements, 35) * 14 + 10,
  );
  const photos = await Promise.all(
    model.items.map(async (item, index) => {
      if (!item.imageUrl) return undefined;
      const image = await prepareProductImage(item.imageUrl, 4 + index);
      if (!image)
        throw new Error(
          `产品 ${item.sku} 图片无法嵌入，请检查已保存图片后重试。`,
        );
      return { ...image, column: 2 };
    }),
  );
  photos.forEach((image) => {
    if (image) images.push(image);
  });
  const labelImages = await Promise.all(
    model.items.map(async (item, index) => {
      if (item.smallLabel.mode !== "image") return undefined;
      const image = await prepareProductImage(
        item.smallLabelImage || "",
        4 + index,
      );
      if (!image)
        throw new Error(
          `产品 ${item.sku} 小标签图片无法嵌入，请检查已保存图片后重试。`,
        );
      return { ...image, column: labelColumn - 1 };
    }),
  );
  labelImages.forEach((image) => {
    if (image) images.push(image);
  });
  sheet.pageSetup.printArea = `A1:H${requirementsRow}`;
  sheet.pageSetup.fitToPage = true;
  sheet.pageSetup.fitToWidth = 1;
  sheet.pageSetup.fitToHeight = 0;
  // The shared package renderer reads widths and print setup from the template.
  // Supply a Production-only derived package including H so contain uses its real width.
  const source = await JSZip.loadAsync(template);
  const path = "xl/worksheets/sheet1.xml";
  let xml = await source.file(path)!.async("string");
  xml = xml.replace(
    "</cols>",
    `<col min="8" max="8" width="${sheet.getColumn(8).width}" customWidth="1"/></cols>`,
  );
  xml = xml.replace(/<pageSetup\b[^>]*\/>/, (tag) =>
    tag
      .replace(/\s(?:scale|fitToWidth|fitToHeight)="[^"]*"/g, "")
      .replace("/>", ' fitToWidth="1" fitToHeight="0"/>'),
  );
  if (xml.includes("<pageSetUpPr"))
    xml = xml.replace(/<pageSetUpPr\b[^>]*\/>/, (tag) =>
      tag.replace(/\sfitToPage="[^"]*"/, "").replace("/>", ' fitToPage="1"/>'),
    );
  else if (xml.includes("</sheetPr>"))
    xml = xml.replace("</sheetPr>", '<pageSetUpPr fitToPage="1"/></sheetPr>');
  else
    xml = xml.replace(
      /(<worksheet\b[^>]*>)/,
      '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>',
    );
  source.file(path, xml);
  return preserveTemplatePackage(
    await source.generateAsync({ type: "arraybuffer" }),
    await workbook.xlsx.writeBuffer(),
    images,
    sheet.name,
    0,
  );
}
