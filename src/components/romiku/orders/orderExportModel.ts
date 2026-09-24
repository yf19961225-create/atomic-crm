import {
  lineAmount,
  type CommercialItem,
} from "../commercial/commercialLineItems";
import {
  orderExportSnapshot,
  type ContactSnapshot,
} from "./orderExportSnapshot";

export type OrderExportModel = {
  worksheetName: "ORDER";
  documentNumber: string;
  documentDate: string;
  currency: "USD" | "CNY";
  seller: ContactSnapshot;
  buyer: ContactSnapshot;
  items: Array<{
    position: number;
    sku: string;
    name: string;
    imageUrl: string;
    specification: string;
    cartons: number;
    qtyPerCarton: number;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  moneyRows: Array<{ key: string; label: string; amount: number }>;
  terms: Array<{ key: string; label: string; text: string }>;
};

const text = (value: unknown) => String(value ?? "").trim();
const number = (value: unknown) => Number(value || 0);
const money = (value: number) => Math.round(value * 100) / 100;
const buyerSnapshot = (value: unknown): ContactSnapshot => {
  const source = (value || {}) as Record<string, unknown>;
  return {
    company_name: text(source.company || source.name),
    address: text(source.shipping_address || source.address),
    tel_whatsapp: text(source.whatsapp || source.phone),
    website: text(source.website),
    email: text(source.email),
  };
};
const termLabels: Array<
  [keyof ReturnType<typeof orderExportSnapshot>["terms"], string]
> = [
  ["payment", "TERMS OF PAYMENT / 付款条件"],
  ["bank_charges", "BANK CHARGES / 银行费用"],
  ["cancellation_deposit", "CANCELLATION & DEPOSIT / 取消订单与定金处理"],
  ["quality_claim", "QUALITY CLAIM / 质量异议"],
  ["force_majeure", "FORCE MAJEURE / 不可抗力"],
  ["dispute_settlement", "DISPUTE SETTLEMENT / 争议解决"],
  ["delivery_lead_time", "DELIVERY LEAD TIME / 交货周期"],
  ["packaging", "PACKAGING / 包装"],
];

/** Pure model: it deliberately only consumes saved document and item snapshots. */
export function normalizeOrderExportModel(
  order: Record<string, unknown>,
  sourceItems: CommercialItem[],
): OrderExportModel {
  const exportSnapshot = orderExportSnapshot(order.terms_snapshot);
  const subtotal = money(
    sourceItems.reduce(
      (sum, item) => sum + lineAmount(item.quantity, item.unit_price),
      0,
    ),
  );
  const freight = money(number(order.freight));
  const otherExpenses = money(number(order.other_expenses));
  const discount = money(number(order.discount));
  const total = money(
    order.total === undefined
      ? subtotal + freight + otherExpenses - discount
      : number(order.total),
  );
  const depositPercent = number(order.deposit_percent);
  const deposit = money((total * depositPercent) / 100);
  const balance = money(total - deposit);
  return {
    worksheetName: "ORDER",
    documentNumber: text(order.document_number),
    documentDate: text(order.document_date),
    currency: order.currency === "CNY" ? "CNY" : "USD",
    seller: exportSnapshot.seller,
    buyer: buyerSnapshot(order.counterparty_snapshot),
    items: [...sourceItems]
      .sort(
        (a, b) =>
          number(a.position) - number(b.position) ||
          String(a.id).localeCompare(String(b.id)),
      )
      .map((item, index) => {
        const product = (item.product_snapshot || {}) as Record<
          string,
          unknown
        >;
        const packing = (item.packing_snapshot || {}) as Record<
          string,
          unknown
        >;
        return {
          position: index + 1,
          sku: text(item.sku),
          name: text(product.name),
          imageUrl: text(product.image_url),
          specification: text(product.specification),
          cartons: number(packing.cartons),
          qtyPerCarton: number(packing.qty_per_carton),
          quantity: number(item.quantity),
          unitPrice: number(item.unit_price),
          amount: lineAmount(item.quantity, item.unit_price),
        };
      }),
    moneyRows: [
      { key: "subtotal", label: "SUBTOTAL / 小计", amount: subtotal },
      { key: "freight", label: "FREIGHT / 运费", amount: freight },
      { key: "total", label: "TOTAL AMOUNT / 总金额", amount: total },
      {
        key: "deposit",
        label: `DEPOSIT / 定金 ${depositPercent}%`,
        amount: deposit,
      },
      {
        key: "balance",
        label: `BALANCE / 尾款 ${money(100 - depositPercent)}%`,
        amount: balance,
      },
    ],
    terms: termLabels.flatMap(([key, label]) => {
      const term = exportSnapshot.terms[key];
      return key === "payment" && term.visible === false
        ? []
        : [{ key, label, text: term.text }];
    }),
  };
}
