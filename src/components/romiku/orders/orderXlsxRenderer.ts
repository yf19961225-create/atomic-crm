import ExcelJS from "exceljs";
import JSZip from "jszip";
import type { OrderExportModel } from "./orderExportModel";

const PRODUCT_START = 9,
  TEMPLATE_DYNAMIC_ROWS = 18;
const PRODUCT_ROW_HEIGHT = 65;
const IMAGE_PADDING = 5;
const EMUS_PER_PIXEL = 9_525;
const columnWidthPixels = (width: number) =>
  Math.floor(((256 * width + Math.floor(128 / 7)) / 256) * 7);
const moneyFormat = (currency: "USD" | "CNY") =>
  currency === "CNY"
    ? "¥#,##0.00;[Red]-¥#,##0.00"
    : "$#,##0.00;[Red]-$#,##0.00";
type RowStyle = {
  height?: number;
  styles: Array<Partial<ExcelJS.Style> | undefined>;
};
const captureStyle = (sheet: ExcelJS.Worksheet, row: number): RowStyle => ({
  height: sheet.getRow(row).height,
  styles: Array.from({ length: 11 }, (_, column) =>
    column ? { ...sheet.getRow(row).getCell(column).style } : undefined,
  ),
});
const applyStyle = (
  sheet: ExcelJS.Worksheet,
  row: number,
  source: RowStyle,
  height: number,
) => {
  const target = sheet.getRow(row);
  target.height = height;
  for (let column = 1; column <= 10; column++) {
    const cell = target.getCell(column);
    cell.value = null;
    cell.style = { ...source.styles[column] };
  }
};
const unmerge = (sheet: ExcelJS.Worksheet, range: string) => {
  try {
    sheet.unMergeCells(range);
  } catch {
    /* dynamic merge may be absent */
  }
};
const clearTemplateDynamicMerges = (sheet: ExcelJS.Worksheet) =>
  [
    "A13:E13",
    "G13:I13",
    "A14:I14",
    "A15:I15",
    "A16:I16",
    "A17:I17",
    "A18:J18",
    "B27:J27",
    ...Array.from({ length: 8 }, (_, i) => `B${19 + i}:C${19 + i}`),
    ...Array.from({ length: 8 }, (_, i) => `D${19 + i}:J${19 + i}`),
  ].forEach((range) => unmerge(sheet, range));
const formatDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[1]}.${Number(match[2])}.${Number(match[3])}` : value;
};

export type OrderTemplateLayout = {
  productStart: number;
  summaryStart: number;
  freightRow: number;
  totalAmountRow: number;
  depositRow: number;
  balanceRow: number;
  termsTitleRow: number;
  termRows: number[];
};
/** The sole row-coordinate planner for the dynamic portion of the fixed template. */
export function buildOrderTemplateLayout(
  itemCount: number,
  paymentVisible: boolean,
): OrderTemplateLayout {
  const summaryStart = PRODUCT_START + Math.max(1, itemCount);
  const freightRow = summaryStart + 1,
    totalAmountRow = summaryStart + 2,
    depositRow = summaryStart + 3,
    balanceRow = summaryStart + 4,
    termsTitleRow = summaryStart + 5;
  return {
    productStart: PRODUCT_START,
    summaryStart,
    freightRow,
    totalAmountRow,
    depositRow,
    balanceRow,
    termsTitleRow,
    termRows: Array.from(
      { length: paymentVisible ? 8 : 7 },
      (_, i) => termsTitleRow + 1 + i,
    ),
  };
}

type ImageDimensions = { width: number; height: number };

/** Reads source pixels from PNG/JPEG bytes without relying on browser decoders. */
const naturalImageDimensions = (buffer: ArrayBuffer): ImageDimensions => {
  const bytes = new Uint8Array(buffer);
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const view = new DataView(buffer);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8)
    throw new Error("Unsupported product image format");
  for (let offset = 2; offset + 8 < bytes.length; ) {
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isStartOfFrame)
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
      };
    if (length < 2) break;
    offset += length;
  }
  throw new Error("Unable to read product image dimensions");
};

type PreparedProductImage = ImageDimensions & {
  row: number;
  buffer: ArrayBuffer;
  extension: "png" | "jpeg";
};

async function prepareProductImage(
  imageUrl: string,
  row: number,
): Promise<PreparedProductImage | undefined> {
  if (!imageUrl) return undefined;
  try {
    const response = await fetch(
      imageUrl.startsWith("data:")
        ? imageUrl
        : `/api/order-export-image?url=${encodeURIComponent(imageUrl)}`,
    );
    if (!response.ok) return;
    let blob = await response.blob();
    if (!/^image\/(png|jpe?g)$/i.test(blob.type)) {
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
      bitmap.close();
      blob = await canvas.convertToBlob({ type: "image/png" });
    }
    const imageBuffer = await blob.arrayBuffer();
    const serverWidth = Number(response.headers.get("X-Image-Width"));
    const serverHeight = Number(response.headers.get("X-Image-Height"));
    const natural =
      serverWidth > 0 && serverHeight > 0
        ? { width: serverWidth, height: serverHeight }
        : naturalImageDimensions(imageBuffer);
    return {
      ...natural,
      row,
      buffer: imageBuffer,
      extension: blob.type.includes("png") ? "png" : "jpeg",
    };
  } catch {
    console.warn("[order-xlsx] product snapshot image unavailable", {
      row,
      imageUrl,
    });
    return undefined;
  }
}

const textPart = async (zip: JSZip, path: string) =>
  (await zip.file(path)?.async("string")) || "";

const maxRelationshipId = (xml: string) =>
  Math.max(
    0,
    ...[...xml.matchAll(/\bId="rId(\d+)"/g)].map((m) => Number(m[1])),
  );
const maxShapeId = (xml: string) =>
  Math.max(
    0,
    ...[...xml.matchAll(/<xdr:cNvPr\b[^>]*\bid="(\d+)"/g)].map((m) =>
      Number(m[1]),
    ),
  );
const rowHeightPoints = (worksheetXml: string, row: number) =>
  Number(
    worksheetXml.match(
      new RegExp(`<row\\b[^>]*\\br="${row}"[^>]*\\bht="([^"]+)"`),
    )?.[1] || PRODUCT_ROW_HEIGHT,
  );
const packageProductAnchor = (
  image: PreparedProductImage,
  photoColumnWidth: number,
  relationshipId: number,
  shapeId: number,
  productIndex: number,
  worksheetXml: string,
) => {
  const cellWidth = photoColumnWidth;
  const cellHeight = rowHeightPoints(worksheetXml, image.row) * (96 / 72);
  const availableWidth = Math.max(1, cellWidth - IMAGE_PADDING * 2);
  const availableHeight = Math.max(1, cellHeight - IMAGE_PADDING * 2);
  const scale = Math.min(
    availableWidth / image.width,
    availableHeight / image.height,
  );
  const width = image.width * scale;
  const height = image.height * scale;
  const widthEmu = Math.floor(width * EMUS_PER_PIXEL);
  const heightEmu = Math.floor(height * EMUS_PER_PIXEL);
  const cellWidthEmu = Math.floor(cellWidth * EMUS_PER_PIXEL);
  const cellHeightEmu = Math.floor(cellHeight * EMUS_PER_PIXEL);
  const colOffEmu = Math.max(
    IMAGE_PADDING * EMUS_PER_PIXEL,
    Math.floor((cellWidthEmu - widthEmu) / 2),
  );
  const rowOffEmu = Math.max(
    IMAGE_PADDING * EMUS_PER_PIXEL,
    Math.floor((cellHeightEmu - heightEmu) / 2),
  );
  return `<xdr:oneCellAnchor><xdr:from><xdr:col>3</xdr:col><xdr:colOff>${colOffEmu}</xdr:colOff><xdr:row>${image.row - 1}</xdr:row><xdr:rowOff>${rowOffEmu}</xdr:rowOff></xdr:from><xdr:ext cx="${widthEmu}" cy="${heightEmu}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${shapeId}" name="Product image ${productIndex}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
};

/**
 * ExcelJS cannot round-trip the template's cropped logo or its native print
 * setup. Keep its generated dynamic cell region, then restore those untouched
 * OOXML parts and append only the new product-image anchors/relationships.
 */
async function preserveTemplatePackage(
  template: ArrayBuffer,
  rendered: ArrayBuffer,
  productImages: PreparedProductImage[],
): Promise<ArrayBuffer> {
  const [source, output] = await Promise.all([
    JSZip.loadAsync(template),
    JSZip.loadAsync(rendered),
  ]);
  const drawingPath = "xl/drawings/drawing1.xml";
  const relationshipPath = "xl/drawings/_rels/drawing1.xml.rels";
  const worksheetPath = "xl/worksheets/sheet1.xml";
  const [sourceWorksheet, outputWorksheet] = await Promise.all([
    textPart(source, worksheetPath),
    textPart(output, worksheetPath),
  ]);
  const [sourceDrawing, sourceRelationships] = await Promise.all([
    textPart(source, drawingPath),
    textPart(source, relationshipPath),
  ]);
  const photoColumnWidth = columnWidthPixels(
    Number(
      sourceWorksheet.match(
        /<col\b[^>]*\bmin="4"[^>]*\bwidth="([^"]+)"/,
      )?.[1] || 8.43,
    ),
  );
  const firstRelationshipId = maxRelationshipId(sourceRelationships) + 1;
  const firstShapeId = maxShapeId(sourceDrawing) + 1;
  const existingImageNumbers = Object.keys(source.files)
    .map((path) => Number(/xl\/media\/image(\d+)\./.exec(path)?.[1]))
    .filter(Number.isFinite);
  const firstImageNumber = Math.max(0, ...existingImageNumbers) + 1;
  const productAnchors = productImages.map((image, index) =>
    packageProductAnchor(
      image,
      photoColumnWidth,
      firstRelationshipId + index,
      firstShapeId + index,
      index + 1,
      outputWorksheet,
    ),
  );
  if (sourceDrawing && productAnchors?.length)
    output.file(
      drawingPath,
      sourceDrawing.replace(
        "</xdr:wsDr>",
        `${productAnchors.join("")}</xdr:wsDr>`,
      ),
    );
  if (sourceRelationships && productImages.length)
    output.file(
      relationshipPath,
      sourceRelationships.replace(
        "</Relationships>",
        `${productImages
          .map(
            (image, index) =>
              `<Relationship Id="rId${firstRelationshipId + index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${firstImageNumber + index}.${image.extension}"/>`,
          )
          .join("")}</Relationships>`,
      ),
    );
  productImages.forEach((image, index) =>
    output.file(
      `xl/media/image${firstImageNumber + index}.${image.extension}`,
      image.buffer,
    ),
  );
  const contentTypesPath = "[Content_Types].xml";
  let contentTypes = await textPart(source, contentTypesPath);
  for (const extension of new Set(
    productImages.map((image) => image.extension),
  )) {
    if (!contentTypes.includes(`Extension="${extension}"`))
      contentTypes = contentTypes.replace(
        "</Types>",
        `<Default Extension="${extension}" ContentType="image/${extension === "jpeg" ? "jpeg" : "png"}"/></Types>`,
      );
  }
  if (contentTypes) output.file(contentTypesPath, contentTypes);

  const sourceMargins = sourceWorksheet.match(/<pageMargins\b[^>]*\/>/)?.[0];
  const sourceSetup = sourceWorksheet.match(/<pageSetup\b[^>]*\/>/)?.[0];
  const sourceSheetPr = sourceWorksheet.match(
    /<sheetPr\b[^>]*(?:\/>|>[\s\S]*?<\/sheetPr>)/,
  )?.[0];
  const sourceSheetViews = sourceWorksheet.match(
    /<sheetViews\b[^>]*>[\s\S]*?<\/sheetViews>/,
  )?.[0];
  const sourcePrintOptions = sourceWorksheet.match(
    /<printOptions\b[^>]*\/>/,
  )?.[0];
  if (outputWorksheet && sourceMargins && sourceSetup) {
    const preservedWorksheet = outputWorksheet
      .replace(/<pageMargins\b[^>]*\/>/, sourceMargins)
      .replace(/<pageSetup\b[^>]*\/>/, sourceSetup)
      .replace(
        /<sheetPr\b[^>]*(?:\/>|>[\s\S]*?<\/sheetPr>)/,
        sourceSheetPr || "",
      )
      .replace(
        /<sheetViews\b[^>]*>[\s\S]*?<\/sheetViews>/,
        sourceSheetViews || "",
      )
      .replace(/<printOptions\b[^>]*\/>/, sourcePrintOptions || "");
    output.file(worksheetPath, preservedWorksheet);
  }
  const workbookPath = "xl/workbook.xml";
  const workbookXml = await textPart(output, workbookPath);
  const printTitles =
    '<definedName name="_xlnm.Print_Titles" localSheetId="0">&apos;ORDER&apos;!$1:$8</definedName>';
  if (workbookXml) {
    const withPrintTitles = workbookXml.includes('name="_xlnm.Print_Titles"')
      ? workbookXml.replace(
          /<definedName name="_xlnm\.Print_Titles"[^>]*>[^<]*<\/definedName>/,
          printTitles,
        )
      : workbookXml.replace("</definedNames>", `${printTitles}</definedNames>`);
    output.file(workbookPath, withPrintTitles);
  }
  return output.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}

/** Uses saved snapshot data only and reconstructs the template's dynamic merged region. */
export async function renderOrderXlsx(
  model: OrderExportModel,
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
    labels: Array.from({ length: 8 }, (_, i) => sheet.getCell(19 + i, 2).text),
  };
  const styles = {
    product: captureStyle(sheet, 9),
    summary: captureStyle(sheet, 13),
    freight: captureStyle(sheet, 14),
    total: captureStyle(sheet, 15),
    deposit: captureStyle(sheet, 16),
    balance: captureStyle(sheet, 17),
    termsTitle: captureStyle(sheet, 18),
    term: captureStyle(sheet, 19),
  };
  clearTemplateDynamicMerges(sheet);
  const paymentVisible = model.terms.some((term) => term.key === "payment");
  const layout = buildOrderTemplateLayout(model.items.length, paymentVisible);
  const dynamicRows = layout.termRows.at(-1)! - PRODUCT_START + 1;
  sheet.spliceRows(
    PRODUCT_START,
    TEMPLATE_DYNAMIC_ROWS,
    ...Array.from({ length: dynamicRows }, () => []),
  );
  // ExcelJS retains some shifted merge metadata through spliceRows. Clear any
  // merge intersecting the rebuilt region before restoring the canonical ranges.
  Object.values(sheet.model.merges)
    .filter((range): range is string => typeof range === "string")
    .filter((range) => {
      const matches = range.match(/\d+/g)?.map(Number) || [];
      return matches.some(
        (row) => row >= PRODUCT_START && row <= layout.termRows.at(-1)!,
      );
    })
    .forEach((range) => unmerge(sheet, range));
  for (let row = PRODUCT_START; row <= layout.termRows.at(-1)!; row++)
    unmerge(sheet, `A${row}:J${row}`);
  sheet.name = model.worksheetName;
  sheet.getCell("J1").value =
    `${model.documentNumber}\n${formatDate(model.documentDate)}`;
  [
    model.seller.company_name,
    model.seller.address,
    model.seller.tel_whatsapp,
    model.seller.website,
    model.seller.email,
  ].forEach((value, i) => {
    sheet.getCell(3 + i, 3).value = value;
  });
  [
    model.buyer.company_name,
    model.buyer.address,
    model.buyer.tel_whatsapp,
    model.buyer.website,
    model.buyer.email,
  ].forEach((value, i) => {
    sheet.getCell(3 + i, 8).value = value;
  });
  model.items.forEach((item, i) => {
    const row = layout.productStart + i;
    applyStyle(sheet, row, styles.product, PRODUCT_ROW_HEIGHT);
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
      model.items.map((item, i) =>
        prepareProductImage(item.imageUrl, layout.productStart + i),
      ),
    )
  ).filter((image): image is PreparedProductImage => Boolean(image));
  const amounts = new Map(model.moneyRows.map((row) => [row.key, row.amount]));
  applyStyle(sheet, layout.summaryStart, styles.summary, 35);
  sheet.mergeCells(`A${layout.summaryStart}:E${layout.summaryStart}`);
  sheet.mergeCells(`G${layout.summaryStart}:I${layout.summaryStart}`);
  sheet.getCell(layout.summaryStart, 1).value = titles.totalCtn;
  sheet.getCell(layout.summaryStart, 6).value = model.items.reduce(
    (sum, item) => sum + item.cartons,
    0,
  );
  sheet.getCell(layout.summaryStart, 7).value = titles.subtotal;
  sheet.getCell(layout.summaryStart, 10).value = amounts.get("subtotal") || 0;
  sheet.getCell(layout.summaryStart, 10).numFmt = moneyFormat(model.currency);
  const summary = (
    row: number,
    style: RowStyle,
    title: string,
    amount: number,
  ) => {
    applyStyle(sheet, row, style, 35);
    sheet.mergeCells(`A${row}:I${row}`);
    sheet.getCell(row, 1).value = title;
    sheet.getCell(row, 10).value = amount;
    sheet.getCell(row, 10).numFmt = moneyFormat(model.currency);
  };
  summary(
    layout.freightRow,
    styles.freight,
    titles.freight,
    amounts.get("freight") || 0,
  );
  summary(
    layout.totalAmountRow,
    styles.total,
    titles.total,
    amounts.get("total") || 0,
  );
  summary(
    layout.depositRow,
    styles.deposit,
    titles.deposit,
    amounts.get("deposit") || 0,
  );
  summary(
    layout.balanceRow,
    styles.balance,
    titles.balance,
    amounts.get("balance") || 0,
  );
  applyStyle(sheet, layout.termsTitleRow, styles.termsTitle, 23.2);
  sheet.mergeCells(`A${layout.termsTitleRow}:J${layout.termsTitleRow}`);
  sheet.getCell(layout.termsTitleRow, 1).value = titles.terms;
  const keys = [
    "payment",
    "bank_charges",
    "cancellation_deposit",
    "quality_claim",
    "force_majeure",
    "dispute_settlement",
    "delivery_lead_time",
    "packaging",
  ];
  model.terms.forEach((term, i) => {
    const row = layout.termRows[i];
    applyStyle(sheet, row, styles.term, 70);
    sheet.mergeCells(`B${row}:C${row}`);
    sheet.mergeCells(`D${row}:J${row}`);
    sheet.getCell(row, 1).value = keys.indexOf(term.key) + 1;
    sheet.getCell(row, 2).value = titles.labels[keys.indexOf(term.key)];
    sheet.getCell(row, 4).value = term.text;
  });
  sheet.pageSetup.printArea = `A1:J${layout.termRows.at(-1)!}`;
  return preserveTemplatePackage(
    template,
    await workbook.xlsx.writeBuffer(),
    productImages,
  );
}
