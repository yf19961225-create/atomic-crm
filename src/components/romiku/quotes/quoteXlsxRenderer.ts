import ExcelJS from "exceljs";
import type { QuoteExportModel } from "./quoteExportModel";
import {
  applyStyle,
  captureStyle,
  clearResidualDynamicMerges,
  formatDate,
  moneyFormat,
  prepareProductImage,
  preserveTemplatePackage,
  unmerge,
  type PreparedProductImage,
  type RowStyle,
} from "../orders/orderXlsxRenderer";

const PRODUCT_START = 8;
const TEMPLATE_PRODUCT_ROWS = 4;

export type QuoteTemplateLayout = {
  productStart: number;
  lastProductRow: number;
};

/** The fixed Quote sheet has no Summary or footer after its product region. */
export function buildQuoteTemplateLayout(
  itemCount: number,
): QuoteTemplateLayout {
  return {
    productStart: PRODUCT_START,
    lastProductRow: PRODUCT_START - 1 + Math.max(0, itemCount),
  };
}

const clearQuoteDynamicMerges = (sheet: ExcelJS.Worksheet) => {
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

/**
 * Renders the fixed RFQ template solely from a normalized saved-snapshot
 * model. Its package finishing path is intentionally shared with Order/PI so
 * the template logo, native drawing package and print setup remain intact.
 */
export async function renderQuoteXlsx(
  model: QuoteExportModel,
  template: ArrayBuffer,
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template);
  const sheet = workbook.worksheets[0];
  const styles = {
    first: captureStyle(sheet, PRODUCT_START),
    middle: captureStyle(sheet, PRODUCT_START + 1),
    last: captureStyle(sheet, PRODUCT_START + TEMPLATE_PRODUCT_ROWS - 1),
  };
  const layout = buildQuoteTemplateLayout(model.items.length);

  clearQuoteDynamicMerges(sheet);
  sheet.spliceRows(
    PRODUCT_START,
    TEMPLATE_PRODUCT_ROWS,
    ...Array.from({ length: model.items.length }, () => []),
  );
  clearResidualDynamicMerges(
    sheet,
    PRODUCT_START,
    Math.max(PRODUCT_START + TEMPLATE_PRODUCT_ROWS, layout.lastProductRow),
  );
  sheet.name = model.worksheetName;
  sheet.getCell("H1").value =
    `${model.document.number}\n${formatDate(model.document.date)}`;
  [
    model.seller.company_name,
    model.seller.address,
    model.seller.tel_whatsapp,
    model.seller.website,
    model.seller.email,
  ].forEach((value, index) => {
    sheet.getCell(2 + index, 3).value = value;
  });

  model.items.forEach((item, index) => {
    const row = layout.productStart + index;
    applyStyle(
      sheet,
      row,
      styleForProductRow(index, model.items.length, styles),
    );
    sheet.getCell(row, 1).value = item.position;
    sheet.getCell(row, 2).value = item.sku;
    sheet.getCell(row, 3).value = item.name;
    sheet.getCell(row, 5).value = item.specification;
    sheet.getCell(row, 6).value = item.qtyPerCarton;
    sheet.getCell(row, 7).value = item.unitPrice;
    sheet.getCell(row, 8).value = item.cartonCbm;
    sheet.getCell(row, 7).numFmt = moneyFormat(model.currency);
    sheet.getCell(row, 8).numFmt = "0.000";
  });
  const productImages = (
    await Promise.all(
      model.items.map((item, index) =>
        prepareProductImage(item.imageUrl, layout.productStart + index),
      ),
    )
  ).filter((image): image is PreparedProductImage => Boolean(image));

  sheet.pageSetup.printArea = `A1:H${layout.lastProductRow}`;
  return preserveTemplatePackage(
    template,
    await workbook.xlsx.writeBuffer(),
    productImages,
    model.worksheetName,
    7,
  );
}
