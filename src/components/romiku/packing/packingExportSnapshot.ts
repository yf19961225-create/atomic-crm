import type { ContactSnapshot } from "../orders/orderExportSnapshot";

const text = (value: unknown) => String(value ?? "").trim();

export const defaultPackingSellerSnapshot = (): ContactSnapshot => ({
  company_name: "YIWU ROMIKU NAIL SUPPLY 义乌络洣库美甲",
  address:
    "72790, 3rd Street, Unit 4, 2nd Floor, Gate 153,Global Digital Trade Center Yiwu,China",
  tel_whatsapp: "+86 190 2577 7589",
  website: "www.romiku.com",
  email: "info@romiku.com",
});

/** Maps the saved document snapshot to the five fixed Packing template lines. */
export const packingContactSnapshot = (value: unknown): ContactSnapshot => {
  const source = (value || {}) as Record<string, unknown>;
  return {
    company_name: text(source.company_name || source.company || source.name),
    address: text(source.shipping_address || source.address),
    tel_whatsapp: text(source.tel_whatsapp || source.whatsapp || source.phone),
    website: text(source.website),
    email: text(source.email),
  };
};

/** Unit is a product snapshot attribute and never a Product Library lookup. */
export const withPackingItemUnit = (
  productSnapshot: Record<string, unknown>,
  unit: string,
) => ({ ...productSnapshot, unit });
