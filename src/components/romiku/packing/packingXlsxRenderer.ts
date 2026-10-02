import ExcelJS from "exceljs";
import type { PackingExportModel } from "./packingExportModel";
import {
  applyStyle,
  captureStyle,
  clearResidualDynamicMerges,
  prepareProductImage,
  preserveTemplatePackage,
  unmerge,
  type PreparedProductImage,
  type RowStyle,
} from "../orders/orderXlsxRenderer";

const PRODUCT_START = 9;
const TEMPLATE_PRODUCT_ROWS = 4;
const TOTAL_ROWS = 3;
const COLUMNS = 16;

export type PackingTemplateLayout = {
  productStart: number;
  lastProductRow: number;
  totalsStart: number;
  lastSummaryRow: number;
};

export const buildPackingTemplateLayout = (
  itemCount: number,
): PackingTemplateLayout => {
  const count = Math.max(0, itemCount);
  const lastProductRow = PRODUCT_START - 1 + count;
  const totalsStart = lastProductRow + 1;
  return {
    productStart: PRODUCT_START,
    lastProductRow,
    totalsStart,
    lastSummaryRow: totalsStart + TOTAL_ROWS - 1,
  };
};

const clearPackingDynamicMerges = (sheet: ExcelJS.Worksheet) => {
  Object.values(sheet.model.merges)
    .filter((range): range is string => typeof range === "string")
    .filter((range) =>
      (range.match(/\d+/g)?.map(Number) || []).some(
        (row) => row >= PRODUCT_START,
      ),
    )
    .forEach((range) => unmerge(sheet, range));
};

const styleForProductRow = (
  index: number,
  itemCount: number,
  styles: { first: RowStyle; middle: RowStyle; last: RowStyle },
) =>
  index === itemCount - 1
    ? styles.last
    : index === 0
      ? styles.first
      : styles.middle;

/** Renders the approved Packing template from a snapshot-only normalized model. */
export async function renderPackingXlsx(
  model: PackingExportModel,
  template: ArrayBuffer,
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template);
  const sheet = workbook.worksheets[0];
  const styles = {
    first: captureStyle(sheet, PRODUCT_START, COLUMNS),
    middle: captureStyle(sheet, PRODUCT_START + 1, COLUMNS),
    last: captureStyle(
      sheet,
      PRODUCT_START + TEMPLATE_PRODUCT_ROWS - 1,
      COLUMNS,
    ),
    totals: [
      captureStyle(sheet, 13, COLUMNS),
      captureStyle(sheet, 14, COLUMNS),
      captureStyle(sheet, 15, COLUMNS),
    ],
  };
  const titles = [
    sheet.getCell("A13").text,
    sheet.getCell("A14").text,
    sheet.getCell("A15").text,
  ];
  const layout = buildPackingTemplateLayout(model.items.length);
  clearPackingDynamicMerges(sheet);
  sheet.spliceRows(
    PRODUCT_START,
    TEMPLATE_PRODUCT_ROWS + TOTAL_ROWS,
    ...Array.from({ length: model.items.length + TOTAL_ROWS }, () => []),
  );
  clearResidualDynamicMerges(
    sheet,
    PRODUCT_START,
    Math.max(15, layout.lastSummaryRow),
  );
  sheet.name = model.worksheetName;
  sheet.getCell("P1").value =
    `${model.document.number}\n${model.document.date}`;
  [
    model.seller.company_name,
    model.seller.address,
    model.seller.tel_whatsapp,
    model.seller.website,
    model.seller.email,
  ].forEach((value, index) => {
    sheet.getCell(3 + index, 3).value = value;
  });
  [
    model.buyer.company_name,
    model.buyer.address,
    model.buyer.tel_whatsapp,
    model.buyer.website,
    model.buyer.email,
  ].forEach((value, index) => {
    sheet.getCell(3 + index, 9).value = value;
  });
  model.items.forEach((item, index) => {
    const row = PRODUCT_START + index;
    applyStyle(
      sheet,
      row,
      styleForProductRow(index, model.items.length, styles),
      COLUMNS,
    );
    [
      item.position,
      item.sku,
      item.name,
      null,
      item.specification,
      item.cartons,
      item.qtyPerCarton,
      item.unit,
      item.quantity,
      item.lengthCm,
      item.widthCm,
      item.heightCm,
      item.cartonCbm,
      item.cartonWeightKg,
      item.totalCbm,
      item.totalWeightKg,
    ].forEach((value, column) => {
      if (column !== 3) sheet.getCell(row, column + 1).value = value;
    });
    sheet.getCell(row, 13).numFmt = "0.000";
    sheet.getCell(row, 14).numFmt = "0.00";
    sheet.getCell(row, 15).numFmt = "0.000";
    sheet.getCell(row, 16).numFmt = "0.00";
  });
  [model.totals.cartons, model.totals.cbm, model.totals.weightKg].forEach(
    (value, index) => {
      const row = layout.totalsStart + index;
      applyStyle(sheet, row, styles.totals[index], COLUMNS);
      sheet.mergeCells(`A${row}:O${row}`);
      sheet.getCell(row, 1).value = titles[index];
      sheet.getCell(row, 16).value = value;
      sheet.getCell(row, 16).numFmt =
        index === 0 ? "0" : index === 1 ? "0.000" : "0.00";
    },
  );
  const productImages = (
    await Promise.all(
      model.items.map((item, index) =>
        prepareProductImage(item.imageUrl, PRODUCT_START + index),
      ),
    )
  ).filter((image): image is PreparedProductImage => Boolean(image));
  sheet.pageSetup.printArea = `A1:P${layout.lastSummaryRow}`;
  return preserveTemplatePackage(
    template,
    await workbook.xlsx.writeBuffer(),
    productImages,
    model.worksheetName,
    8,
  );
}
