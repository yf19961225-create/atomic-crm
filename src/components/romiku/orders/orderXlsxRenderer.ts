import ExcelJS from "exceljs";
import type { OrderExportModel } from "./orderExportModel";

const currencyFormat = (currency: "USD" | "CNY") =>
  currency === "CNY"
    ? "¥#,##0.00;[Red]-¥#,##0.00"
    : "$#,##0.00;[Red]-$#,##0.00";

function copyRowStyle(
  sheet: ExcelJS.Worksheet,
  source: number,
  target: number,
) {
  const sourceRow = sheet.getRow(source);
  const targetRow = sheet.getRow(target);
  targetRow.height = sourceRow.height;
  sourceRow.eachCell({ includeEmpty: true }, (cell, column) => {
    const next = targetRow.getCell(column);
    next.style = { ...cell.style };
  });
}

const writeContact = (
  sheet: ExcelJS.Worksheet,
  firstRow: number,
  values: Record<string, string>,
) => {
  [
    values.company_name,
    values.address,
    values.tel_whatsapp,
    values.website,
    values.email,
  ].forEach((value, index) => {
    sheet.getCell(firstRow + index, firstRow === 3 ? 3 : 8).value = value;
  });
};

/** Renders from an already-saved normalized model; it has no data-provider imports. */
export async function renderOrderXlsx(
  model: OrderExportModel,
  template: ArrayBuffer,
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template);
  const sheet = workbook.worksheets[0];
  sheet.name = model.worksheetName;
  sheet.getCell("J1").value = `${model.documentNumber}\n${model.documentDate}`;
  writeContact(sheet, 3, model.seller);
  [
    model.buyer.company_name,
    model.buyer.address,
    model.buyer.tel_whatsapp,
    model.buyer.website,
    model.buyer.email,
  ].forEach((value, index) => {
    sheet.getCell(3 + index, 8).value = value;
  });

  const baseItemRows = 4;
  const neededRows = Math.max(1, model.items.length);
  if (neededRows > baseItemRows) {
    const count = neededRows - baseItemRows;
    sheet.spliceRows(13, 0, ...Array.from({ length: count }, () => []));
    for (let row = 13; row < 13 + count; row++) copyRowStyle(sheet, 12, row);
  } else if (neededRows < baseItemRows) {
    sheet.spliceRows(9 + neededRows, baseItemRows - neededRows);
  }
  const itemEnd = 8 + neededRows;
  model.items.forEach((item, index) => {
    const row = 9 + index;
    copyRowStyle(sheet, 9, row);
    const values = [
      item.position,
      item.sku,
      item.name,
      "",
      item.specification,
      item.cartons,
      item.qtyPerCarton,
      item.quantity,
      item.unitPrice,
      item.amount,
    ];
    values.forEach((value, column) => {
      sheet.getCell(row, column + 1).value = value;
    });
    sheet.getCell(row, 9).numFmt = currencyFormat(model.currency);
    sheet.getCell(row, 10).numFmt = currencyFormat(model.currency);
  });
  // Image URLs are already saved in the Order item snapshot. A failed remote
  // image fetch is non-fatal: the template's photo cell stays empty rather
  // than reading a current Product Master or blocking an export.
  await Promise.all(
    model.items.map(async (item, index) => {
      if (!item.imageUrl) return;
      try {
        const response = await fetch(item.imageUrl);
        if (!response.ok) return;
        const contentType = response.headers.get("content-type") || "";
        const extension = contentType.includes("png") ? "png" : "jpeg";
        const imageId = workbook.addImage({
          buffer: await response.arrayBuffer(),
          extension,
        });
        const row = 9 + index;
        sheet.addImage(imageId, `D${row}:D${row}`);
      } catch {
        // Snapshot text is still exported even when a remote image is unavailable.
      }
    }),
  );
  const totalsStart = itemEnd + 1;
  const baseTotalsRows = 5;
  const extraMoneyRows = model.moneyRows.length - baseTotalsRows;
  if (extraMoneyRows > 0)
    sheet.spliceRows(
      totalsStart + 2,
      0,
      ...Array.from({ length: extraMoneyRows }, () => []),
    );
  const termsStart = totalsStart + model.moneyRows.length;
  model.moneyRows.forEach((moneyRow, index) => {
    const row = totalsStart + index;
    copyRowStyle(sheet, 13, row);
    sheet.getCell(row, 1).value =
      moneyRow.key === "subtotal"
        ? `TOTAL CTN / 总箱数: ${model.items.reduce((sum, item) => sum + item.cartons, 0)}     ${moneyRow.label}`
        : moneyRow.label;
    sheet.getCell(row, 10).value = moneyRow.amount;
    sheet.getCell(row, 10).numFmt = currencyFormat(model.currency);
  });
  copyRowStyle(sheet, 18, termsStart);
  sheet.getCell(termsStart, 1).value = "TERMS & CONDITIONS / 条款与条件";
  model.terms.forEach((term, index) => {
    const row = termsStart + 1 + index;
    copyRowStyle(sheet, 19, row);
    sheet.getCell(row, 2).value = term.label;
    sheet.getCell(row, 4).value = term.text;
  });
  sheet.pageSetup.printArea = `A1:J${termsStart + model.terms.length}`;
  return await workbook.xlsx.writeBuffer();
}
