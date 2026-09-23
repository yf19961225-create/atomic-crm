import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import notoSansScUrl from "@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff?url";
import type { OrderExportModel } from "./orderExportModel";

/** Direct vector PDF renderer, intentionally not a browser screenshot. */
export async function renderOrderPdf(
  model: OrderExportModel,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const cjk = await pdf.embedFont(
    await fetch(notoSansScUrl).then((response) => response.arrayBuffer()),
    { subset: true },
  );
  let page = pdf.addPage([842, 595]);
  let y = 565;
  const text = (value: string, x: number, size = 8, useBold = false) =>
    page.drawText(value.slice(0, 120), {
      x,
      y,
      size,
      font: [...value].some((character) => character.codePointAt(0)! > 127)
        ? cjk
        : useBold
          ? bold
          : font,
      color: rgb(0, 0, 0),
    });
  text("ORDER", 40, 18, true);
  text(`ORDER.NO: ${model.documentNumber}`, 610);
  y -= 16;
  text(`DATE: ${model.documentDate}`, 610);
  y -= 25;
  text("SELLER / 卖方", 40, 10, true);
  text("BUYER / 买方", 430, 10, true);
  y -= 14;
  [
    model.seller.company_name,
    model.seller.address,
    model.seller.tel_whatsapp,
    model.seller.website,
    model.seller.email,
  ].forEach((line, index) => {
    text(line, 40);
    text(
      [
        model.buyer.company_name,
        model.buyer.address,
        model.buyer.tel_whatsapp,
        model.buyer.website,
        model.buyer.email,
      ][index],
      430,
    );
    y -= 12;
  });
  y -= 8;
  [
    "No.",
    "SKU",
    "PRODUCT",
    "PHOTO",
    "DESCRIPTION",
    "CTN",
    "QTY/CTN",
    "TOTAL QTY",
    "UNIT PRICE",
    "AMOUNT",
  ].forEach((header, i) => text(header, 35 + i * 78, 7, true));
  y -= 13;
  for (const item of model.items) {
    if (y < 110) {
      page = pdf.addPage([842, 595]);
      y = 565;
    }
    [
      String(item.position),
      item.sku,
      item.name,
      "",
      item.specification,
      String(item.cartons),
      String(item.qtyPerCarton),
      String(item.quantity),
      item.unitPrice.toFixed(2),
      item.amount.toFixed(2),
    ].forEach((value, i) => text(value, 35 + i * 78, 7));
    y -= 14;
  }
  y -= 6;
  for (const row of model.moneyRows) {
    text(row.label, 430, 8, true);
    text(`${model.currency} ${row.amount.toFixed(2)}`, 720, 8, true);
    y -= 13;
  }
  y -= 6;
  text("TERMS & CONDITIONS / 条款与条件", 40, 10, true);
  y -= 13;
  for (const term of model.terms) {
    if (y < 45) {
      page = pdf.addPage([842, 595]);
      y = 565;
    }
    text(term.label, 40, 7, true);
    text(term.text, 260, 7);
    y -= 12;
  }
  return pdf.save();
}
