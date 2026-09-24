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
    address:
      "72790, 3rd Street, Unit 4, 2nd Floor, Gate 153, Global Digital Trade Center Yiwu, China",
    tel_whatsapp: "+86 190 2577 7589",
    website: "www.romiku.com",
    email: "info@romiku.com",
  },
  terms: {
    payment: {
      visible: true,
      text: "30% deposit by T/T in advance; the remaining 70% to be paid in full within 7 days of receiving notification that the goods are ready for dispatch and prior to shipment\n预付 30% 电汇（T/T）定金；在收到货物已准备好发运的通知后 7 天内，且在出运前，付清其余 70% 的尾款。",
    },
    bank_charges: {
      text: "All bank charges outside China shall be borne by the Buyer.\n所有境外银行费用由买方承担。",
    },
    cancellation_deposit: {
      text: "If the order is cancelled or abandoned due to the Buyer's reasons, the 30% deposit is non-refundable and shall be forfeited as compensation for materials and labor.\n若因买方原因取消或放弃订单，30% 的定金将不予退还，并作为材料和人工损失的补偿金予以没收。",
    },
    quality_claim: {
      text: "Any quality claim shall be raised within 30 days after arrival of goods at destination.\n货物到达目的港后30天内提出质量异议。",
    },
    force_majeure: {
      text: "Seller shall not be liable for any delay or failure in performance due to force majeure.\n因不可抗力导致的延迟或无法履行，卖方不承担责任。",
    },
    dispute_settlement: {
      text: "Any dispute arising from this contract shall be settled through friendly negotiation.\n因本合同产生的任何争议，双方应友好协商解决。",
    },
    delivery_lead_time: {
      text: "Delivery lead time: 7-10 days after receiving deposit, subject to stock availability.\n收到定金后 7-10 天，具体视库存情况而定。",
    },
    packaging: {
      text: "Standard export packaging, securely packed in sturdy outer cartons.\n标准出口包装，安全牢固地包装在坚固的外纸箱内。",
    },
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
