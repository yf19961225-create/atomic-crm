import type { ContactSnapshot } from "../orders/orderExportSnapshot";

export type QuoteExportSnapshot = {
  template_key: "quote";
  seller: ContactSnapshot;
};

export const defaultQuoteExportSnapshot = (): QuoteExportSnapshot => ({
  template_key: "quote",
  seller: {
    company_name: "YIWU ROMIKU NAIL SUPPLY 义乌络洣库美甲",
    address:
      "72790, 3rd Street, Unit 4, 2nd Floor, Gate 153,Global Digital Trade Center Yiwu,China\n义乌市国际商贸城六区152号门2楼4单元3街72790",
    tel_whatsapp: "+86 190 2577 7589",
    website: "www.romiku.com",
    email: "info@romiku.com",
  },
});

export function quoteExportSnapshot(value: unknown): QuoteExportSnapshot {
  const defaults = defaultQuoteExportSnapshot();
  const saved = value as { quote_export?: Partial<QuoteExportSnapshot> } | null;
  const quoteExport = saved?.quote_export;
  if (!quoteExport) return defaults;
  return {
    template_key: "quote",
    seller: { ...defaults.seller, ...quoteExport.seller },
  };
}

export function withQuoteExportSnapshot(
  termsSnapshot: Record<string, unknown> | null | undefined,
  quoteExport: QuoteExportSnapshot,
) {
  return { ...(termsSnapshot || {}), quote_export: quoteExport };
}
