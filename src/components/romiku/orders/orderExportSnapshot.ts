export type ContactSnapshot = {
  company_name: string;
  address: string;
  tel_whatsapp: string;
  website: string;
  email: string;
};

export type OrderExportSnapshot = {
  template_key: "order";
  seller: ContactSnapshot;
  terms: Record<
    | "payment"
    | "bank_charges"
    | "cancellation_deposit"
    | "quality_claim"
    | "force_majeure"
    | "dispute_settlement"
    | "delivery_lead_time"
    | "packaging",
    { text: string; visible?: boolean }
  >;
};

export const defaultOrderExportSnapshot = (): OrderExportSnapshot => ({
  template_key: "order",
  seller: {
    company_name: "YIWU ROMIKU NAIL SUPPLY 义乌络洣库美甲",
    address: "No. 1, Qingkou East Road, Yiwu, Zhejiang, China",
    tel_whatsapp: "+86 190 2577 7589",
    website: "www.romiku.com",
    email: "info@romiku.com",
  },
  terms: {
    payment: {
      visible: true,
      text: "Payment terms as agreed by both parties.",
    },
    bank_charges: { text: "All bank charges are borne by the buyer." },
    cancellation_deposit: {
      text: "Deposit is non-refundable after production starts.",
    },
    quality_claim: {
      text: "Quality claims must be raised promptly after receipt.",
    },
    force_majeure: {
      text: "Neither party is liable for force majeure events.",
    },
    dispute_settlement: {
      text: "Disputes will be settled through friendly consultation.",
    },
    delivery_lead_time: {
      text: "Delivery lead time is subject to the confirmed order.",
    },
    packaging: { text: "Standard export packaging unless otherwise agreed." },
  },
});

export function orderExportSnapshot(value: unknown): OrderExportSnapshot {
  const saved = value as { order_export?: Partial<OrderExportSnapshot> } | null;
  const defaults = defaultOrderExportSnapshot();
  const exportSnapshot = saved?.order_export;
  if (!exportSnapshot) return defaults;
  return {
    template_key: "order",
    seller: { ...defaults.seller, ...exportSnapshot.seller },
    terms: Object.fromEntries(
      Object.entries(defaults.terms).map(([key, term]) => [
        key,
        {
          ...term,
          ...(exportSnapshot.terms?.[key as keyof typeof defaults.terms] || {}),
        },
      ]),
    ) as OrderExportSnapshot["terms"],
  };
}

export function withOrderExportSnapshot(
  termsSnapshot: Record<string, unknown> | null | undefined,
  orderExport: OrderExportSnapshot,
) {
  return { ...(termsSnapshot || {}), order_export: orderExport };
}
