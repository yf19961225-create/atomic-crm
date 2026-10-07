import {
  normalizeQuoteExportModel,
  quoteBuyerSnapshot,
  type QuoteExportModel,
} from "../quotes/quoteExportModel.js";
import {
  renderQuoteXlsx,
  type QuoteRenderOptions,
} from "../quotes/quoteXlsxRenderer.js";

const numberOrNull = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** The website's business timezone is fixed; never use the export machine's date. */
function inquiryBusinessDate(value: unknown): string {
  const saved = String(value || "");
  if (!saved || /^\d{4}-\d{2}-\d{2}$/.test(saved)) return saved;
  const date = new Date(saved);
  if (Number.isNaN(date.getTime())) return saved;
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join("-");
}

/** The persisted normalized submission is the only source, including its original date. */
export function normalizeInquiryExportModel(
  inquiry: Record<string, unknown>,
  items: Record<string, unknown>[],
): QuoteExportModel {
  const model = normalizeQuoteExportModel(
    {
      document_number: inquiry.document_number,
      document_date: inquiryBusinessDate(
        inquiry.submitted_at || inquiry.created_at,
      ),
      source_website_inquiry_id: inquiry.id || "inquiry",
    },
    [],
  );
  model.buyer = quoteBuyerSnapshot({
    company: inquiry.company,
    contact_name:
      inquiry.customer_name || inquiry.contact_name || inquiry.customerName,
    whatsapp: inquiry.whatsapp,
    email: inquiry.email,
  });
  model.items = [...items]
    .sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
    .map((item, index) => {
      const product =
        item.product_snapshot && typeof item.product_snapshot === "object"
          ? (item.product_snapshot as Record<string, unknown>)
          : {};
      return {
        position: index + 1,
        sku: String(item.sku || ""),
        name: String(
          product.name || item.product_name || item.productName || "",
        ),
        imageUrl: String(
          product.image_url || item.image_url || item.image || "",
        ),
        specification: String(
          product.specification || item.specification || "",
        ),
        requestedQuantity: numberOrNull(item.quantity),
        qtyPerCarton: numberOrNull(
          product.cartonQty ?? item.carton_qty ?? item.cartonQty,
        ),
        unitPrice: null,
        cartonCbm: numberOrNull(
          product.carton_cbm ?? item.carton_cbm ?? item.cartonCbm,
        ),
      };
    });
  return model;
}

/** Callers pass the fixed Inquiry package, never a Quote package. Works in Node with an injected safe image loader. */
export function renderInquiryXlsx(
  model: QuoteExportModel,
  template: ArrayBuffer,
  options: Pick<QuoteRenderOptions, "prepareImage"> = {},
): Promise<ArrayBuffer> {
  return renderQuoteXlsx(
    {
      ...model,
      templateKind: "website",
      items: model.items.map((item) => ({ ...item, unitPrice: null })),
    },
    template,
    { ...options, preserveTemplateSeller: true },
  );
}
