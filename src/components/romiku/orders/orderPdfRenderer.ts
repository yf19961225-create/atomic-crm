import {
  PDFDocument,
  StandardFonts,
  type PDFImage,
  type PDFFont,
  rgb,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import JSZip from "jszip";
import notoSansScUrl from "@/assets/fonts/NotoSansSC-Variable.ttf?url";
import orderTemplateUrl from "@/assets/order-templates/ROMIKU_订单_模板.xlsx?url";
import type { OrderExportModel } from "./orderExportModel";

const PAGE_WIDTH = 595.28,
  PAGE_HEIGHT = 841.89,
  LEFT = 24,
  RIGHT = PAGE_WIDTH - 24,
  BOTTOM = 26,
  FIRST_PRODUCT_Y = 574,
  CONTINUED_PRODUCT_Y = 756,
  PRODUCT_HEADER_HEIGHT = 22,
  PRODUCT_ROW_MIN_HEIGHT = 58,
  SUMMARY_ROW_HEIGHT = 19,
  TERMS_TITLE_HEIGHT = 22,
  TERM_MIN_HEIGHT = 46,
  BLUE = rgb(0.87, 0.93, 0.97),
  BORDER = rgb(0.45, 0.55, 0.62),
  TEXT = rgb(0.08, 0.12, 0.16),
  IMAGE_PADDING = 5;

const columns = [
  ["No.", 23],
  ["货号\nSKU", 47],
  ["产品名称\nPRODUCT", 69],
  ["图片\nPHOTO", 55],
  ["产品规格\nDESCRIPTION", 105],
  ["箱数\nCTN", 31],
  ["装箱数\nQTY/CTN", 40],
  ["总数量\nTOTAL QTY", 42],
  ["单价\nUNIT PRICE", 59],
  ["总金额\nAMOUNT", 73],
] as const;

type PlannedSummary = {
  height: number;
  rows: Array<{ key: string; label: string; amount: number }>;
};
type PlannedTerm = OrderExportModel["terms"][number] & { height: number };
export type OrderPdfPagePlan = {
  first: boolean;
  items: OrderExportModel["items"];
  itemHeights: number[];
  summary?: PlannedSummary;
  termsTitle?: boolean;
  terms: PlannedTerm[];
};
export type OrderPdfPlan = { pages: OrderPdfPagePlan[] };

const price = (amount: number, currency: OrderExportModel["currency"]) =>
  `${currency === "CNY" ? "¥" : "USD "}${amount.toFixed(2)}`;
const toLines = (value: string, width: number, size = 7) =>
  Math.max(
    1,
    Math.ceil(
      [...value].length / Math.max(1, Math.floor(width / (size * 0.85))),
    ),
  );
const itemHeight = (item: OrderExportModel["items"][number]) =>
  Math.max(
    PRODUCT_ROW_MIN_HEIGHT,
    12 + Math.max(toLines(item.name, 64), toLines(item.specification, 100)) * 9,
  );
const termHeight = (term: OrderExportModel["terms"][number]) =>
  Math.max(TERM_MIN_HEIGHT, 15 + toLines(term.text, 362, 7) * 9);
const summaryRows = (model: OrderExportModel) => [
  {
    key: "total_ctn",
    label: "TOTAL CTN / 总箱数",
    amount: model.items.reduce((total, item) => total + item.cartons, 0),
  },
  ...model.moneyRows,
];

/**
 * The PDF-only page planner. It consumes the already-normalized saved model
 * and keeps product rows, the complete money block, and individual Terms
 * together before drawing a page.
 */
export function planOrderPdf(model: OrderExportModel): OrderPdfPlan {
  const pages: OrderPdfPagePlan[] = [];
  const createPage = (first = false): OrderPdfPagePlan => {
    const page: OrderPdfPagePlan = {
      first,
      items: [],
      itemHeights: [],
      terms: [],
    };
    pages.push(page);
    return page;
  };
  let page = createPage(true);
  let cursor = FIRST_PRODUCT_Y - PRODUCT_HEADER_HEIGHT;

  for (const item of model.items) {
    const height = itemHeight(item);
    if (cursor - height < BOTTOM) {
      page = createPage();
      cursor = CONTINUED_PRODUCT_Y - PRODUCT_HEADER_HEIGHT;
    }
    page.items.push(item);
    page.itemHeights.push(height);
    cursor -= height;
  }

  const rows = summaryRows(model);
  const summary: PlannedSummary = {
    rows,
    height: rows.length * SUMMARY_ROW_HEIGHT,
  };
  if (cursor - summary.height < BOTTOM) {
    page = createPage();
    cursor = CONTINUED_PRODUCT_Y - PRODUCT_HEADER_HEIGHT;
  }
  page.summary = summary;
  cursor -= summary.height;

  let hasTermsTitle = false;
  for (const term of model.terms) {
    const planned = { ...term, height: termHeight(term) };
    if (
      !hasTermsTitle &&
      cursor - TERMS_TITLE_HEIGHT - planned.height < BOTTOM
    ) {
      page = createPage();
      cursor = CONTINUED_PRODUCT_Y - PRODUCT_HEADER_HEIGHT;
    }
    if (!hasTermsTitle) {
      page.termsTitle = true;
      cursor -= TERMS_TITLE_HEIGHT;
      hasTermsTitle = true;
    }
    if (cursor - planned.height < BOTTOM) {
      page = createPage();
      cursor = CONTINUED_PRODUCT_Y - PRODUCT_HEADER_HEIGHT;
    }
    page.terms.push(planned);
    cursor -= planned.height;
  }
  return { pages };
}

type LoadedImages = {
  logo?: PDFImage;
  products: Map<string, PDFImage>;
};
type Fonts = {
  latin: PDFFont;
  latinExt: PDFFont;
  cjk: PDFFont;
};

const isPng = (bytes: Uint8Array) =>
  bytes.length > 8 &&
  bytes[0] === 0x89 &&
  bytes[1] === 0x50 &&
  bytes[2] === 0x4e &&
  bytes[3] === 0x47;

async function embedRaster(
  pdf: PDFDocument,
  bytes: ArrayBuffer,
): Promise<PDFImage | undefined> {
  try {
    return isPng(new Uint8Array(bytes))
      ? await pdf.embedPng(bytes)
      : await pdf.embedJpg(bytes);
  } catch {
    return undefined;
  }
}

async function loadImages(
  pdf: PDFDocument,
  model: OrderExportModel,
): Promise<LoadedImages> {
  const products = new Map<string, PDFImage>();
  const logo = await (async () => {
    try {
      const template = await fetch(orderTemplateUrl).then((response) =>
        response.arrayBuffer(),
      );
      const media = (await JSZip.loadAsync(template)).file(/^xl\/media\//)[0];
      return media
        ? embedRaster(pdf, await media.async("arraybuffer"))
        : undefined;
    } catch {
      return undefined;
    }
  })();
  await Promise.all(
    model.items.map(async (item) => {
      if (!item.imageUrl || products.has(item.imageUrl)) return;
      try {
        const response = await fetch(
          item.imageUrl.startsWith("data:")
            ? item.imageUrl
            : `/api/order-export-image?url=${encodeURIComponent(item.imageUrl)}`,
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const image = await embedRaster(pdf, await response.arrayBuffer());
        if (image) products.set(item.imageUrl, image);
      } catch {
        console.warn("[order-pdf] product snapshot image unavailable", {
          sku: item.sku,
        });
      }
    }),
  );
  return { logo, products };
}

type Page = ReturnType<PDFDocument["addPage"]>;
const cell = (
  page: Page,
  x: number,
  y: number,
  width: number,
  height: number,
  fill?: ReturnType<typeof rgb>,
) =>
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: BORDER,
    borderWidth: 0.45,
    color: fill,
  });

const glyphFont = (glyph: string, fonts: Fonts) => {
  const codePoint = glyph.codePointAt(0) ?? 0;
  if (codePoint <= 0x7f) return fonts.latin;
  if (codePoint <= 0x24f) return fonts.latinExt;
  return fonts.cjk;
};

const textWidth = (value: string, fonts: Fonts, size: number) =>
  [...value].reduce(
    (width, glyph) =>
      width + glyphFont(glyph, fonts).widthOfTextAtSize(glyph, size),
    0,
  );

function lines(
  value: string,
  fonts: Fonts,
  size: number,
  width: number,
): string[] {
  const output: string[] = [];
  for (const logicalLine of value.split(/\r?\n/)) {
    let current = "";
    for (const glyph of [...logicalLine]) {
      const next = current + glyph;
      if (current && textWidth(next, fonts, size) > width) {
        output.push(current.trimEnd());
        current = glyph.trimStart();
      } else current = next;
    }
    output.push(current || " ");
  }
  return output;
}

function drawLines(
  page: Page,
  value: string,
  fonts: Fonts,
  size: number,
  x: number,
  top: number,
  width: number,
  lineHeight = size * 1.3,
  align: "left" | "center" | "right" = "left",
) {
  const valueLines = lines(value, fonts, size, width);
  valueLines.forEach((line, index) => {
    const lineWidth = textWidth(line, fonts, size);
    let cursor =
      align === "center"
        ? x + (width - lineWidth) / 2
        : align === "right"
          ? x + width - lineWidth
          : x;
    const glyphs = [...line];
    let start = 0;
    while (start < glyphs.length) {
      const font = glyphFont(glyphs[start], fonts);
      let end = start + 1;
      while (end < glyphs.length && glyphFont(glyphs[end], fonts) === font)
        end += 1;
      const run = glyphs.slice(start, end).join("");
      page.drawText(run, {
        x: cursor,
        y: top - size - index * lineHeight,
        size,
        font,
        color: TEXT,
      });
      cursor += font.widthOfTextAtSize(run, size);
      start = end;
    }
  });
  return valueLines.length * lineHeight;
}

function drawImageContain(
  page: Page,
  image: PDFImage | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (!image) return;
  const availableWidth = Math.max(1, width - IMAGE_PADDING * 2);
  const availableHeight = Math.max(1, height - IMAGE_PADDING * 2);
  const scale = Math.min(
    availableWidth / image.width,
    availableHeight / image.height,
  );
  const renderedWidth = image.width * scale;
  const renderedHeight = image.height * scale;
  page.drawImage(image, {
    x: x + IMAGE_PADDING + (availableWidth - renderedWidth) / 2,
    y: y + IMAGE_PADDING + (availableHeight - renderedHeight) / 2,
    width: renderedWidth,
    height: renderedHeight,
  });
}

const formatDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[1]}.${Number(match[2])}.${Number(match[3])}` : value;
};

function drawOrderIdentity(
  page: Page,
  model: OrderExportModel,
  fonts: Fonts,
  logo: PDFImage | undefined,
  compact = false,
) {
  const top = PAGE_HEIGHT - 25;
  if (!compact) drawImageContain(page, logo, LEFT, top - 30, 125, 28);
  drawLines(
    page,
    "ORDER",
    fonts,
    compact ? 13 : 18,
    compact ? LEFT : 252,
    top,
    compact ? 85 : 96,
    20,
    "center",
  );
  const identitySize = 6.6;
  const orderNo = `ORDER.NO: ${model.documentNumber}`;
  const documentDate = `DATE: ${formatDate(model.documentDate)}`;
  page.drawText(orderNo, {
    x: RIGHT - fonts.latin.widthOfTextAtSize(orderNo, identitySize),
    y: top - identitySize,
    size: identitySize,
    font: fonts.latin,
    color: TEXT,
  });
  page.drawText(documentDate, {
    x: RIGHT - fonts.latin.widthOfTextAtSize(documentDate, identitySize),
    y: top - identitySize - 11,
    size: identitySize,
    font: fonts.latin,
    color: TEXT,
  });
}

function drawContacts(page: Page, model: OrderExportModel, fonts: Fonts) {
  const top = 765,
    height = 105,
    width = (RIGHT - LEFT) / 2;
  cell(page, LEFT, top - height, width, height);
  cell(page, LEFT + width, top - height, width, height);
  drawLines(page, "SELLER / 卖方", fonts, 8, LEFT + 6, top - 5, width - 12);
  drawLines(
    page,
    "BUYER / 买方",
    fonts,
    8,
    LEFT + width + 6,
    top - 5,
    width - 12,
  );
  const rows = [
    "company_name",
    "address",
    "tel_whatsapp",
    "website",
    "email",
  ] as const;
  rows.forEach((key, index) => {
    const y = top - 20 - index * 16;
    drawLines(page, model.seller[key], fonts, 7, LEFT + 6, y, width - 12, 9);
    drawLines(
      page,
      model.buyer[key],
      fonts,
      7,
      LEFT + width + 6,
      y,
      width - 12,
      9,
    );
  });
  return top - height - 7;
}

function drawRequirements(
  page: Page,
  model: OrderExportModel,
  fonts: Fonts,
  top: number,
) {
  const height = 47,
    labelWidth = 91;
  cell(page, LEFT, top - height, labelWidth, height, BLUE);
  cell(
    page,
    LEFT + labelWidth,
    top - height,
    RIGHT - LEFT - labelWidth,
    height,
  );
  drawLines(
    page,
    "订单要求\nREQUIREMENTS",
    fonts,
    7,
    LEFT + 5,
    top - 6,
    labelWidth - 10,
    9,
    "center",
  );
  drawLines(
    page,
    model.requirements,
    fonts,
    7,
    LEFT + labelWidth + 5,
    top - 6,
    RIGHT - LEFT - labelWidth - 10,
    9,
  );
  return top - height - 8;
}

function drawProductHeader(page: Page, top: number, fonts: Fonts) {
  let x = LEFT;
  for (const [label, width] of columns) {
    cell(
      page,
      x,
      top - PRODUCT_HEADER_HEIGHT,
      width,
      PRODUCT_HEADER_HEIGHT,
      BLUE,
    );
    drawLines(page, label, fonts, 6, x + 2, top - 3, width - 4, 7, "center");
    x += width;
  }
  return top - PRODUCT_HEADER_HEIGHT;
}

function drawProduct(
  page: Page,
  item: OrderExportModel["items"][number],
  top: number,
  height: number,
  fonts: Fonts,
  image?: PDFImage,
) {
  const values = [
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
  ];
  let x = LEFT;
  const bottom = top - height;
  columns.forEach(([, width], index) => {
    cell(page, x, bottom, width, height);
    if (index === 3) drawImageContain(page, image, x, bottom, width, height);
    else {
      const centered = [0, 5, 6, 7, 8, 9].includes(index);
      drawLines(
        page,
        values[index],
        fonts,
        6.5,
        x + 3,
        top - 5,
        width - 6,
        8,
        centered ? "center" : "left",
      );
    }
    x += width;
  });
  return bottom;
}

function drawSummary(
  page: Page,
  summary: PlannedSummary,
  model: OrderExportModel,
  top: number,
  fonts: Fonts,
) {
  const labelWidth = 405,
    valueWidth = RIGHT - LEFT - labelWidth;
  let cursor = top;
  summary.rows.forEach((row) => {
    const bottom = cursor - SUMMARY_ROW_HEIGHT;
    cell(page, LEFT, bottom, labelWidth, SUMMARY_ROW_HEIGHT, BLUE);
    cell(page, LEFT + labelWidth, bottom, valueWidth, SUMMARY_ROW_HEIGHT);
    drawLines(page, row.label, fonts, 7, LEFT + 6, cursor - 4, labelWidth - 12);
    const value =
      row.key === "total_ctn"
        ? String(row.amount)
        : price(row.amount, model.currency);
    drawLines(
      page,
      value,
      fonts,
      7,
      LEFT + labelWidth + 5,
      cursor - 4,
      valueWidth - 10,
      9,
      "right",
    );
    cursor = bottom;
  });
  return cursor;
}

function drawTermsTitle(page: Page, top: number, fonts: Fonts) {
  cell(
    page,
    LEFT,
    top - TERMS_TITLE_HEIGHT,
    RIGHT - LEFT,
    TERMS_TITLE_HEIGHT,
    BLUE,
  );
  drawLines(
    page,
    "TERMS & CONDITIONS / 条款与条件",
    fonts,
    8,
    LEFT + 6,
    top - 4,
    RIGHT - LEFT - 12,
    10,
    "center",
  );
  return top - TERMS_TITLE_HEIGHT;
}

function drawTerm(
  page: Page,
  term: PlannedTerm,
  index: number,
  top: number,
  fonts: Fonts,
) {
  const numberWidth = 20,
    labelWidth = 145,
    textWidth = RIGHT - LEFT - numberWidth - labelWidth,
    bottom = top - term.height;
  cell(page, LEFT, bottom, numberWidth, term.height);
  cell(page, LEFT + numberWidth, bottom, labelWidth, term.height, BLUE);
  cell(page, LEFT + numberWidth + labelWidth, bottom, textWidth, term.height);
  drawLines(
    page,
    String(index),
    fonts,
    7,
    LEFT + 2,
    top - 5,
    numberWidth - 4,
    9,
    "center",
  );
  drawLines(
    page,
    term.label,
    fonts,
    6.4,
    LEFT + numberWidth + 4,
    top - 5,
    labelWidth - 8,
    8,
  );
  drawLines(
    page,
    term.text,
    fonts,
    6.7,
    LEFT + numberWidth + labelWidth + 5,
    top - 5,
    textWidth - 10,
    8.5,
  );
  return bottom;
}

/** Direct vector PDF renderer; this intentionally does not capture the browser. */
export async function renderOrderPdf(
  model: OrderExportModel,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const notoSansSc = await pdf.embedFont(
    await fetch(notoSansScUrl).then((response) => response.arrayBuffer()),
    // Keep the complete TrueType cmap: fontkit's PDF subset path drops glyphs
    // from this CJK font in some PDF consumers.
    { subset: false },
  );
  // Use Helvetica for ASCII metrics and the complete OFL-licensed Noto Sans SC
  // font for Chinese/extended Latin glyphs. Both are sans serif and avoid glyph
  // loss without relying on browser or OS font fallback.
  const fonts = {
    cjk: notoSansSc,
    latin: await pdf.embedFont(StandardFonts.Helvetica),
    latinExt: notoSansSc,
  };
  const images = await loadImages(pdf, model);
  const plan = planOrderPdf(model);
  let termNumber = 1;
  for (const pagePlan of plan.pages) {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawOrderIdentity(page, model, fonts, images.logo, !pagePlan.first);
    let cursor = pagePlan.first
      ? drawRequirements(page, model, fonts, drawContacts(page, model, fonts))
      : CONTINUED_PRODUCT_Y;
    if (pagePlan.items.length) {
      cursor = drawProductHeader(page, cursor, fonts);
      pagePlan.items.forEach((item, index) => {
        cursor = drawProduct(
          page,
          item,
          cursor,
          pagePlan.itemHeights[index],
          fonts,
          images.products.get(item.imageUrl),
        );
      });
    }
    if (pagePlan.summary)
      cursor = drawSummary(page, pagePlan.summary, model, cursor, fonts);
    if (pagePlan.termsTitle) cursor = drawTermsTitle(page, cursor, fonts);
    pagePlan.terms.forEach((term) => {
      cursor = drawTerm(page, term, termNumber++, cursor, fonts);
    });
  }
  return pdf.save();
}
