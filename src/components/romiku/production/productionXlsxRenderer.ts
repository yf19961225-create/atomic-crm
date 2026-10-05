import JSZip from "jszip";
import ExcelJS from "exceljs";
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
  // Canonical A:H template: C barcode, D image, E description.
  const product = captureStyle(sheet, 4, 8),
    footer = captureStyle(sheet, 5, 8),
    requirements = captureStyle(sheet, 6, 8);
  const labels = {
    cartons: sheet.getCell("A5").text,
    quantity: sheet.getCell("G5").text,
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
    applyStyle(sheet, row, product, 8);
    [
      item.position,
      item.sku,
      item.barcodeNumber,
      null,
      item.description,
      item.cartons,
      item.qtyPerCarton,
      item.quantity,
    ].forEach((value, column) => {
      sheet.getCell(row, column + 1).value = value;
    });
    sheet.getCell(row, 3).numFmt = "@";
    sheet.getRow(row).height = Math.max(
      product.height || 112,
      wrappedLines(item.description, 22) * 24 + 10,
    );
  });
  applyStyle(sheet, footerRow, footer, 8);
  sheet.mergeCells(`A${footerRow}:E${footerRow}`);
  sheet.getCell(footerRow, 1).value = labels.cartons;
  sheet.getCell(footerRow, 6).value = model.totals.cartons;
  sheet.getCell(footerRow, 7).value = labels.quantity;
  sheet.getCell(footerRow, 8).value = model.totals.quantity;
  applyStyle(sheet, requirementsRow, requirements, 8);
  sheet.mergeCells(`A${requirementsRow}:B${requirementsRow}`);
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
      column = [0, 3, 4][index],
      cell = sheet.getCell(2, column + 1);
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
      images.push({ ...image, column });
    }
  }
  sheet.getCell("F2").value = model.marking.labeling_requirements;
  sheet.getCell("F2").alignment = {
    ...sheet.getCell("F2").alignment,
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
      return { ...image, column: 3 };
    }),
  );
  photos.forEach((image) => {
    if (image) images.push(image);
  });
  sheet.pageSetup.printArea = `A1:H${requirementsRow}`;
  const output = await preserveTemplatePackage(
    template,
    await workbook.xlsx.writeBuffer(),
    images,
    sheet.name,
    0,
  );
  // The shared helper fits single cells. Only this template's front mark spans A:C.
  // Adjust its own anchor inside that merged area without changing column widths
  // or any of the frozen commercial exporters.
  const front = images.find((image) => image.column === 0 && image.row === 2);
  if (!front) return output;
  const width = [1, 2, 3].reduce(
    (sum, col) =>
      sum +
      Math.floor(
        ((256 * (sheet.getColumn(col).width || 8.43) + Math.floor(128 / 7)) /
          256) *
          7,
      ),
    0,
  );
  const height = ((sheet.getRow(2).height || 137) * 96) / 72;
  const scale = Math.min(
    (width - 10) / front.width,
    (height - 10) / front.height,
  );
  const cx = Math.floor(front.width * scale * 9525),
    cy = Math.floor(front.height * scale * 9525);
  const x = Math.floor((width * 9525 - cx) / 2),
    y = Math.floor((height * 9525 - cy) / 2);
  const zip = await JSZip.loadAsync(output),
    path = "xl/drawings/drawing1.xml";
  const drawing = await zip.file(path)!.async("string");
  zip.file(
    path,
    drawing.replace(
      /<xdr:oneCellAnchor>[\s\S]*?<\/xdr:oneCellAnchor>/g,
      (anchor) => {
        if (
          !anchor.includes("<xdr:col>0</xdr:col>") ||
          !anchor.includes("<xdr:row>1</xdr:row>")
        )
          return anchor;
        return anchor
          .replace(
            /<xdr:colOff>\d+<\/xdr:colOff>/,
            `<xdr:colOff>${x}</xdr:colOff>`,
          )
          .replace(
            /<xdr:rowOff>\d+<\/xdr:rowOff>/,
            `<xdr:rowOff>${y}</xdr:rowOff>`,
          )
          .replace(
            /<(xdr:ext|a:ext) cx="\d+" cy="\d+"\/>/g,
            `<$1 cx="${cx}" cy="${cy}"/>`,
          );
      },
    ),
  );
  return zip.generateAsync({ type: "arraybuffer" });
}
