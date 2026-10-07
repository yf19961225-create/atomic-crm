import { cartonCbmFromPacking } from "../commercial/commercialLineItems.js";
import type { ContactSnapshot } from "../orders/orderExportSnapshot.js";
import { quoteExportSnapshot } from "./quoteExportSnapshot.js";

type SavedItem = {
  id?: unknown;
  position?: unknown;
  sku?: unknown;
  unit_price?: unknown;
  requested_quantity_snapshot?: unknown;
  product_snapshot?: unknown;
  packing_snapshot?: unknown;
};

export type QuoteExportItem = {
  position: number;
  sku: string;
  name: string;
  imageUrl: string;
  specification: string;
  qtyPerCarton: number | null;
  unitPrice: number | null;
  requestedQuantity: number | null;
  cartonCbm: number | null;
};

export type QuoteExportModel = {
  worksheetName: "ROMIKU PI";
  templateKind: "direct" | "website";
  buyer: ContactSnapshot;
  document: { number: string; date: string };
  seller: ContactSnapshot;
  currency: "USD" | "CNY";
  items: QuoteExportItem[];
};

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const numberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Maps only saved Quote header/item snapshots to the fixed Quote template.
 * It deliberately receives all rows from its caller and has no data-provider,
 * Product Library, Sanity, or supplier dependencies.
 */
export function normalizeQuoteExportModel(
  quote: Record<string, unknown>,
  savedItems: SavedItem[],
): QuoteExportModel {
  const ordered = [...savedItems].sort(
    (left, right) =>
      Number(left.position || 0) - Number(right.position || 0) ||
      String(left.id || "").localeCompare(String(right.id || "")),
  );
  return {
    worksheetName: "ROMIKU PI",
    templateKind: quote.source_website_inquiry_id ? "website" : "direct",
    buyer: quoteBuyerSnapshot(quote.counterparty_snapshot),
    document: {
      number: String(quote.document_number || ""),
      date: String(quote.document_date || ""),
    },
    seller: quoteExportSnapshot(quote.terms_snapshot).seller,
    currency: quote.currency === "CNY" ? "CNY" : "USD",
    items: ordered.map((item, index) => {
      const product = object(item.product_snapshot);
      const packing = object(item.packing_snapshot);
      return {
        position: index + 1,
        sku: String(item.sku || ""),
        name: String(product.name || ""),
        imageUrl: String(product.image_url || ""),
        specification: String(
          product.specification || packing.description || "",
        ),
        qtyPerCarton: numberOrNull(packing.qty_per_carton),
        unitPrice: numberOrNull(item.unit_price) ?? 0,
        requestedQuantity:
          (numberOrNull(item.requested_quantity_snapshot) ?? 0) > 0
            ? numberOrNull(item.requested_quantity_snapshot)
            : null,
        cartonCbm: cartonCbmFromPacking(packing),
      };
    }),
  };
}

/** Saved customer data only; company never hides the named contact. */
export function quoteBuyerSnapshot(value: unknown): ContactSnapshot {
  const source = object(value);
  const text = (value: unknown) => String(value ?? "").trim();
  const company = text(source.company || source.company_name);
  const contact = text(
    source.contact_name || source.customerName || source.name,
  );
  return {
    company_name: [...new Set([company, contact].filter(Boolean))].join("\n"),
    address: text(source.shipping_address || source.address),
    tel_whatsapp: text(source.whatsapp || source.phone),
    website: text(source.website),
    email: text(source.email),
  };
}
