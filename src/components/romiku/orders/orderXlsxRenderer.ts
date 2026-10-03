import ExcelJS from "exceljs";
import JSZip from "jszip";
import type { OrderExportModel } from "./orderExportModel";

// The fixed template keeps the product header at row 9; item rows begin at 10.
const PRODUCT_START = 10,
  TEMPLATE_DYNAMIC_ROWS = 18;
const FALLBACK_PRODUCT_ROW_HEIGHT = 65;
const IMAGE_PADDING = 5;
const EMUS_PER_PIXEL = 9_525;
const columnWidthPixels = (width: number) =>
  Math.floor(((256 * width + Math.floor(128 / 7)) / 256) * 7);
export const moneyFormat = (currency: "USD" | "CNY") =>
  currency === "CNY"
    ? "¥#,##0.00;[Red]-¥#,##0.00"
    : "$#,##0.00;[Red]-$#,##0.00";
export type RowStyle = {
  height?: number;
  styles: Array<Partial<ExcelJS.Style> | undefined>;
};
export const captureStyle = (
  sheet: ExcelJS.Worksheet,
  row: number,
  columnCount = 10,
): RowStyle => ({
  height: sheet.getRow(row).height,
  styles: Array.from({ length: columnCount + 1 }, (_, column) =>
    column ? { ...sheet.getRow(row).getCell(column).style } : undefined,
  ),
});
export const applyStyle = (
  sheet: ExcelJS.Worksheet,
  row: number,
  source: RowStyle,
  columnCount = 10,
) => {
  const target = sheet.getRow(row);
  target.height = source.height ?? FALLBACK_PRODUCT_ROW_HEIGHT;
  for (let column = 1; column <= columnCount; column++) {
    const cell = target.getCell(column);
    cell.value = null;
    cell.style = { ...source.styles[column] };
  }
};
export const unmerge = (sheet: ExcelJS.Worksheet, range: string) => {
  try {
    sheet.unMergeCells(range);
  } catch {
    /* dynamic merge may be absent */
  }
};
export const clearResidualDynamicMerges = (
  sheet: ExcelJS.Worksheet,
  firstRow: number,
  lastRow: number,
) => {
  // ExcelJS spliceRows can leave merge-map entries whose shifted cells were
  // already unmerged. Remove only those stale entries before rebuilding the
  // dynamic template region.
  const merges = (
    sheet as unknown as {
      _merges: Record<
        string,
        { top: number; bottom: number; left: number; right: number }
      >;
    }
  )._merges;
  for (const [master, merge] of Object.entries(merges))
    if (merge.top <= lastRow && merge.bottom >= firstRow) delete merges[master];
};
const clearTemplateDynamicMerges = (sheet: ExcelJS.Worksheet) =>
  [
    "A14:E14",
    "G14:I14",
    "A15:I15",
    "A16:I16",
    "A17:I17",
    "A18:I18",
    "A19:J19",
    ...Array.from({ length: 8 }, (_, i) => `B${20 + i}:C${20 + i}`),
    ...Array.from({ length: 8 }, (_, i) => `D${20 + i}:J${20 + i}`),
  ].forEach((range) => unmerge(sheet, range));
export const formatDate = (value: string) => {
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
  terms: number | boolean,
): OrderTemplateLayout {
  const termCount =
    typeof terms === "boolean" ? (terms ? 8 : 7) : Math.max(0, terms);
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
      { length: termCount },
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

export type PreparedProductImage = ImageDimensions & {
  /** Zero-based target column; existing commercial templates default to D. */
  column?: number;
  row: number;
  buffer: ArrayBuffer;
  extension: "png" | "jpeg";
};

export async function prepareProductImage(
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
    )?.[1] || FALLBACK_PRODUCT_ROW_HEIGHT,
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
  return `<xdr:oneCellAnchor><xdr:from><xdr:col>${image.column ?? 3}</xdr:col><xdr:colOff>${colOffEmu}</xdr:colOff><xdr:row>${image.row - 1}</xdr:row><xdr:rowOff>${rowOffEmu}</xdr:rowOff></xdr:from><xdr:ext cx="${widthEmu}" cy="${heightEmu}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${shapeId}" name="Product image ${productIndex}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
};

/**
 * ExcelJS cannot round-trip the template's cropped logo or its native print
 * setup. Keep its generated dynamic cell region, then restore those untouched
 * OOXML parts and append only the new product-image anchors/relationships.
 */
export async function preserveTemplatePackage(
  template: ArrayBuffer,
  rendered: ArrayBuffer,
  productImages: PreparedProductImage[],
  worksheetName: string,
  printTitleLastRow: number,
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
      image.column === undefined
        ? photoColumnWidth
        : columnWidthPixels(
            Number(
              [...sourceWorksheet.matchAll(/<col\b[^>]*\/>/g)]
                .map(([column]) => ({
                  min: Number(column.match(/\bmin="(\d+)"/)?.[1]),
                  max: Number(column.match(/\bmax="(\d+)"/)?.[1]),
                  width: Number(column.match(/\bwidth="([^"]+)"/)?.[1]),
                }))
                .find(
                  (column) =>
                    column.min <= image.column! + 1 &&
                    column.max >= image.column! + 1,
                )?.width || 8.43,
            ),
          ),
      firstRelationshipId + index,
      firstShapeId + index,
      index + 1,
      outputWorksheet,
    ),
  );
  if (sourceDrawing)
    output.file(
      drawingPath,
      sourceDrawing.replace(
        "</xdr:wsDr>",
        `${productAnchors.join("")}</xdr:wsDr>`,
      ),
    );
  if (sourceRelationships)
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
  // Production templates may have no logo/drawing parts. Bootstrap the same
  // package-level anchors rather than adding a separate image renderer.
  if (!sourceDrawing && productImages.length) {
    output.file(
      drawingPath,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${productAnchors.join("")}</xdr:wsDr>`,
    );
    output.file(
      relationshipPath,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${productImages.map((image, index) => `<Relationship Id="rId${firstRelationshipId + index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${firstImageNumber + index}.${image.extension}"/>`).join("")}</Relationships>`,
    );
    const sheetRelationsPath = "xl/worksheets/_rels/sheet1.xml.rels";
    const sheetRelations =
      (await textPart(output, sheetRelationsPath)) ||
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
    const drawingRelationId = maxRelationshipId(sheetRelations) + 1;
    output.file(
      sheetRelationsPath,
      sheetRelations.replace(
        "</Relationships>",
        `<Relationship Id="rId${drawingRelationId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`,
      ),
    );
    output.file(
      worksheetPath,
      outputWorksheet.replace(
        "</worksheet>",
        `<drawing r:id="rId${drawingRelationId}"/></worksheet>`,
      ),
    );
  }
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
  if (
    !sourceDrawing &&
    productImages.length &&
    !contentTypes.includes('PartName="/xl/drawings/drawing1.xml"')
  )
    contentTypes = contentTypes.replace(
      "</Types>",
      '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>',
    );
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
    const preservedWorksheet = (await textPart(output, worksheetPath))
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
  const printTitles = `<definedName name="_xlnm.Print_Titles" localSheetId="0">&apos;${worksheetName}&apos;!$1:$${printTitleLastRow}</definedName>`;
  if (workbookXml && printTitleLastRow > 0) {
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
    totalCtn: sheet.getCell("A14").text,
    subtotal: sheet.getCell("G14").text,
    freight: sheet.getCell("A15").text,
    total: sheet.getCell("A16").text,
    deposit: sheet.getCell("A17").text,
    balance: sheet.getCell("A18").text,
    terms: sheet.getCell("A19").text,
    labels: Array.from({ length: 8 }, (_, i) => sheet.getCell(20 + i, 2).text),
  };
  const styles = {
    product: captureStyle(sheet, 10),
    summary: captureStyle(sheet, 14),
    freight: captureStyle(sheet, 15),
    total: captureStyle(sheet, 16),
    deposit: captureStyle(sheet, 17),
    balance: captureStyle(sheet, 18),
    termsTitle: captureStyle(sheet, 19),
    term: captureStyle(sheet, 20),
  };
  clearTemplateDynamicMerges(sheet);
  const layout = buildOrderTemplateLayout(
    model.items.length,
    model.terms.length,
  );
  const lastDynamicRow = layout.termRows.at(-1) ?? layout.balanceRow;
  const dynamicRows = lastDynamicRow - PRODUCT_START + 1;
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
        (row) => row >= PRODUCT_START && row <= lastDynamicRow,
      );
    })
    .forEach((range) => unmerge(sheet, range));
  for (let row = PRODUCT_START; row <= lastDynamicRow; row++)
    [
      `A${row}:E${row}`,
      `G${row}:I${row}`,
      `A${row}:I${row}`,
      `A${row}:J${row}`,
      `B${row}:C${row}`,
      `D${row}:J${row}`,
      `B${row}:J${row}`,
    ].forEach((range) => unmerge(sheet, range));
  clearResidualDynamicMerges(sheet, PRODUCT_START, layout.termRows.at(-1)!);
  sheet.name = model.worksheetName;
  sheet.getCell("J1").value =
    `${model.documentNumber}\n${formatDate(model.documentDate)}`;
  // A8:B8 is the template-owned REQUIREMENTS title. Its merged C8:J8 region
  // is the saved Order notes content and must not source any live data.
  sheet.getCell("C8").value = model.requirements;
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
    applyStyle(sheet, row, styles.product);
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
  applyStyle(sheet, layout.summaryStart, styles.summary);
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
    applyStyle(sheet, row, style);
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
  if (model.terms.length) {
    applyStyle(sheet, layout.termsTitleRow, styles.termsTitle);
    sheet.mergeCells(`A${layout.termsTitleRow}:J${layout.termsTitleRow}`);
    sheet.getCell(layout.termsTitleRow, 1).value = titles.terms;
  }
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
    applyStyle(sheet, row, styles.term);
    sheet.mergeCells(`B${row}:C${row}`);
    sheet.mergeCells(`D${row}:J${row}`);
    sheet.getCell(row, 1).value = keys.indexOf(term.key) + 1;
    sheet.getCell(row, 2).value = titles.labels[keys.indexOf(term.key)];
    sheet.getCell(row, 4).value = term.text;
  });
  sheet.pageSetup.printArea = `A1:J${lastDynamicRow}`;
  return preserveTemplatePackage(
    template,
    await workbook.xlsx.writeBuffer(),
    productImages,
    model.worksheetName,
    8,
  );
}
