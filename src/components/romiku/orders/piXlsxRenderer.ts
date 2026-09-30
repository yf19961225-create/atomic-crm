import ExcelJS from "exceljs";
import type { PiExportModel } from "./piExportModel";
import {
  applyStyle,
  captureStyle,
  clearResidualDynamicMerges,
  formatDate,
  moneyFormat,
  prepareProductImage,
  preserveTemplatePackage,
  type RowStyle,
  unmerge,
} from "./orderXlsxRenderer";

const PRODUCT_START = 9;
const TEMPLATE_DYNAMIC_ROWS = 25;

export type PiTemplateLayout = {
  productStart: number;
  summaryStart: number;
  freightRow: number;
  totalAmountRow: number;
  depositRow: number;
  balanceRow: number;
  termsTitleRow?: number;
  termRows: number[];
  bankingTitleRow?: number;
  bankRows: number[];
  lastRow: number;
};

/** The single authority for PI's dynamic product, summary, Terms and Banking rows. */
export function buildPiTemplateLayout(
  itemCount: number,
  termsVisible: boolean,
  bankVisible: boolean,
): PiTemplateLayout {
  const summaryStart = PRODUCT_START + Math.max(1, itemCount);
  const freightRow = summaryStart + 1;
  const totalAmountRow = summaryStart + 2;
  const depositRow = summaryStart + 3;
  const balanceRow = summaryStart + 4;
  const termsTitleRow = termsVisible ? summaryStart + 5 : undefined;
  const termRows = termsTitleRow
    ? Array.from({ length: 8 }, (_, index) => termsTitleRow + 1 + index)
    : [];
  const bankingTitleRow = bankVisible
    ? termsTitleRow
      ? summaryStart + 14
      : summaryStart + 5
    : undefined;
  const bankRows = bankingTitleRow
    ? Array.from({ length: 6 }, (_, index) => bankingTitleRow + 1 + index)
    : [];
  return {
    productStart: PRODUCT_START,
    summaryStart,
    freightRow,
    totalAmountRow,
    depositRow,
    balanceRow,
    termsTitleRow,
    termRows,
    bankingTitleRow,
    bankRows,
    lastRow: bankRows.at(-1) ?? termRows.at(-1) ?? balanceRow,
  };
}

const clearDynamicMerges = (sheet: ExcelJS.Worksheet, lastRow: number) => {
  Object.values(sheet.model.merges)
    .filter((range): range is string => typeof range === "string")
    .filter((range) => {
      const rows = range.match(/\d+/g)?.map(Number) || [];
      return rows.some((row) => row >= PRODUCT_START && row <= lastRow);
    })
    .forEach((range) => unmerge(sheet, range));
  clearResidualDynamicMerges(sheet, PRODUCT_START, lastRow);
};

const percentageLabel = (title: string, percentage: number) =>
  title.replace(/\d+(?:\.\d+)?%/, `${percentage}%`);

/** Uses the approved PI template and saved PI snapshots only. */
export async function renderPiXlsx(
  model: PiExportModel,
  template: ArrayBuffer,
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template);
  const sheet = workbook.worksheets[0];
  const titles = {
    totalCtn: sheet.getCell("A13").text,
    subtotal: sheet.getCell("G13").text,
    freight: sheet.getCell("A14").text,
    total: sheet.getCell("A15").text,
    deposit: sheet.getCell("A16").text,
    balance: sheet.getCell("A17").text,
    terms: sheet.getCell("A18").text,
    termLabels: Array.from(
      { length: 8 },
      (_, index) => sheet.getCell(19 + index, 2).text,
    ),
    banking: sheet.getCell("A27").text,
    bankLabels: Array.from(
      { length: 6 },
      (_, index) => sheet.getCell(28 + index, 1).text,
    ),
  };
  const styles = {
    productFirst: captureStyle(sheet, 9),
    productMiddle: captureStyle(sheet, 10),
    productLast: captureStyle(sheet, 12),
    summary: captureStyle(sheet, 13),
    freight: captureStyle(sheet, 14),
    total: captureStyle(sheet, 15),
    deposit: captureStyle(sheet, 16),
    balance: captureStyle(sheet, 17),
    termsTitle: captureStyle(sheet, 18),
    term: captureStyle(sheet, 19),
    bankingTitle: captureStyle(sheet, 27),
    bank: captureStyle(sheet, 28),
  };
  const layout = buildPiTemplateLayout(
    model.items.length,
    model.termsVisible,
    model.bankInformationVisible,
  );
  sheet.spliceRows(
    PRODUCT_START,
    TEMPLATE_DYNAMIC_ROWS,
    ...Array.from({ length: layout.lastRow - PRODUCT_START + 1 }, () => []),
  );
  clearDynamicMerges(sheet, Math.max(33, layout.lastRow));
  sheet.name = model.worksheetName;
  sheet.getCell("J1").value =
    `${model.document.number}\n${formatDate(model.document.date)}`;
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
    sheet.getCell(3 + index, 8).value = value;
  });
  model.items.forEach((item, index) => {
    const row = layout.productStart + index;
    const style: RowStyle =
      index === 0
        ? styles.productFirst
        : index === model.items.length - 1
          ? styles.productLast
          : styles.productMiddle;
    applyStyle(sheet, row, style);
    sheet.getCell(row, 1).value = item.position;
    sheet.getCell(row, 2).value = item.sku;
    sheet.getCell(row, 3).value = item.name;
    sheet.getCell(row, 5).value = item.specification;
    sheet.getCell(row, 6).value = item.cartons;
    sheet.getCell(row, 7).value = item.qtyPerCarton;
    sheet.getCell(row, 8).value = item.quantity;
    sheet.getCell(row, 9).value = item.unitPrice;
    sheet.getCell(row, 10).value = item.amount;
    sheet.getCell(row, 9).numFmt = moneyFormat(model.currency);
    sheet.getCell(row, 10).numFmt = moneyFormat(model.currency);
  });
  const productImages = (
    await Promise.all(
      model.items.map((item, index) =>
        prepareProductImage(item.imageUrl, layout.productStart + index),
      ),
    )
  ).filter((image): image is NonNullable<typeof image> => Boolean(image));
  const summary = (
    row: number,
    style: RowStyle,
    title: string,
    amount: number,
  ) => {
    applyStyle(sheet, row, style);
    sheet.mergeCells(`A${row}:I${row}`);
    sheet.getCell(row, 1).value = title;
    sheet.getCell(row, 10).value = amount;
    sheet.getCell(row, 10).numFmt = moneyFormat(model.currency);
  };
  applyStyle(sheet, layout.summaryStart, styles.summary);
  sheet.mergeCells(`A${layout.summaryStart}:E${layout.summaryStart}`);
  sheet.mergeCells(`G${layout.summaryStart}:I${layout.summaryStart}`);
  sheet.getCell(layout.summaryStart, 1).value = titles.totalCtn;
  sheet.getCell(layout.summaryStart, 6).value = model.totals.totalCtn;
  sheet.getCell(layout.summaryStart, 7).value = titles.subtotal;
  sheet.getCell(layout.summaryStart, 10).value = model.totals.subtotal;
  sheet.getCell(layout.summaryStart, 10).numFmt = moneyFormat(model.currency);
  summary(
    layout.freightRow,
    styles.freight,
    titles.freight,
    model.totals.freight,
  );
  summary(
    layout.totalAmountRow,
    styles.total,
    titles.total,
    model.totals.total,
  );
  summary(
    layout.depositRow,
    styles.deposit,
    percentageLabel(titles.deposit, model.payment.depositPercent),
    model.payment.deposit,
  );
  summary(
    layout.balanceRow,
    styles.balance,
    percentageLabel(titles.balance, 100 - model.payment.depositPercent),
    model.payment.balance,
  );
  if (layout.termsTitleRow) {
    applyStyle(sheet, layout.termsTitleRow, styles.termsTitle);
    sheet.mergeCells(`A${layout.termsTitleRow}:J${layout.termsTitleRow}`);
    sheet.getCell(layout.termsTitleRow, 1).value = titles.terms;
    model.terms.forEach((term, index) => {
      const row = layout.termRows[index];
      applyStyle(sheet, row, styles.term);
      sheet.mergeCells(`B${row}:C${row}`);
      sheet.mergeCells(`D${row}:J${row}`);
      sheet.getCell(row, 1).value = index + 1;
      sheet.getCell(row, 2).value = titles.termLabels[index];
      sheet.getCell(row, 4).value = term.text;
    });
  }
  if (layout.bankingTitleRow) {
    applyStyle(sheet, layout.bankingTitleRow, styles.bankingTitle);
    sheet.mergeCells(`A${layout.bankingTitleRow}:J${layout.bankingTitleRow}`);
    sheet.getCell(layout.bankingTitleRow, 1).value = titles.banking;
    const bankValues = [
      model.bank.beneficiary_name,
      model.bank.beneficiary_address,
      model.bank.bank_name,
      model.bank.bank_address,
      model.bank.account_no,
      model.bank.swift_code,
    ];
    layout.bankRows.forEach((row, index) => {
      applyStyle(sheet, row, styles.bank);
      sheet.mergeCells(`A${row}:B${row}`);
      sheet.mergeCells(`C${row}:J${row}`);
      sheet.getCell(row, 1).value = titles.bankLabels[index];
      sheet.getCell(row, 3).value = bankValues[index];
    });
  }
  sheet.pageSetup.printArea = `A1:J${layout.lastRow}`;
  return preserveTemplatePackage(
    template,
    await workbook.xlsx.writeBuffer(),
    productImages,
    model.worksheetName,
    8,
  );
}
