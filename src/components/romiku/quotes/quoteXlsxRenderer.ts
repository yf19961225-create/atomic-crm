import ExcelJS from "exceljs";
import type { QuoteExportModel } from "./quoteExportModel.js";
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
} from "../orders/orderXlsxRenderer.js";

export type QuoteRenderOptions = {
  prepareImage?: (
    url: string,
    row: number,
  ) => Promise<PreparedProductImage | undefined>;
  /** Inquiry keeps its fixed ROMIKU supplier block verbatim. */
  preserveTemplateSeller?: boolean;
};

const PRODUCT_START = 9;
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
  options: QuoteRenderOptions = {},
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template);
  const sheet = workbook.worksheets[0];
  const columns = model.templateKind === "website" ? 9 : 8;
  const styles = {
    first: captureStyle(sheet, PRODUCT_START, columns),
    middle: captureStyle(sheet, PRODUCT_START + 1, columns),
    last: captureStyle(
      sheet,
      PRODUCT_START + TEMPLATE_PRODUCT_ROWS - 1,
      columns,
    ),
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
  sheet.getCell(1, columns).value =
    `${model.document.number}\n${formatDate(model.document.date)}`;
  if (!options.preserveTemplateSeller)
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
    sheet.getCell(3 + index, 6).value = value || null;
  });

  model.items.forEach((item, index) => {
    const row = layout.productStart + index;
    applyStyle(
      sheet,
      row,
      styleForProductRow(index, model.items.length, styles),
      columns,
    );
    sheet.getCell(row, 1).value = item.position;
    sheet.getCell(row, 2).value = item.sku;
    sheet.getCell(row, 3).value = item.name;
    sheet.getCell(row, 5).value = item.specification;
    if (columns === 9) sheet.getCell(row, 6).value = item.requestedQuantity;
    sheet.getCell(row, columns - 2).value = item.qtyPerCarton;
    sheet.getCell(row, columns - 1).value = item.unitPrice;
    sheet.getCell(row, columns).value = item.cartonCbm;
    sheet.getCell(row, columns - 1).numFmt = moneyFormat(model.currency);
    sheet.getCell(row, columns).numFmt = "0.000";
  });
  const productImages = (
    await Promise.all(
      model.items.map((item, index) =>
        (options.prepareImage || prepareProductImage)(
          item.imageUrl,
          layout.productStart + index,
        ),
      ),
    )
  ).filter((image): image is PreparedProductImage => Boolean(image));

  sheet.pageSetup.printArea = `A1:${columns === 9 ? "I" : "H"}${layout.lastProductRow}`;
  return preserveTemplatePackage(
    template,
    await workbook.xlsx.writeBuffer(),
    productImages,
    model.worksheetName,
    8,
  );
}
