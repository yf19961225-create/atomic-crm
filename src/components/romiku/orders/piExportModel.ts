import {
  lineAmount,
  type CommercialItem,
} from "../commercial/commercialLineItems";
import type { ContactSnapshot } from "./orderExportSnapshot";
import {
  defaultPiBankSnapshot,
  piExportSnapshot,
  type PiBankSnapshot,
} from "./piExportSnapshot";

export type PiExportItem = {
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
};

export type PiExportTerm = { key: string; text: string; visible?: boolean };

export type PiExportModel = {
  worksheetName: "ROMIKU PI";
  document: { number: string; date: string };
  currency: "USD" | "CNY";
  seller: ContactSnapshot;
  buyer: ContactSnapshot;
  commercial: { priceTerm: string; shipmentMethod: string };
  payment: { depositPercent: number; deposit: number; balance: number };
  totals: {
    totalCtn: number;
    subtotal: number;
    freight: number;
    total: number;
  };
  items: PiExportItem[];
  terms: PiExportTerm[];
  termsVisible: boolean;
  bank: PiBankSnapshot;
  bankInformationVisible: boolean;
};

const text = (value: unknown) => String(value ?? "").trim();
const number = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value: number) => Math.round(value * 100) / 100;

const savedBuyerSnapshot = (value: unknown): ContactSnapshot => {
  const source = (value || {}) as Record<string, unknown>;
  return {
    company_name: text(source.company || source.name),
    address: text(source.shipping_address || source.address),
    tel_whatsapp: text(source.whatsapp || source.phone),
    website: text(source.website),
    email: text(source.email),
  };
};

/** Purely transforms the saved PI and saved item snapshots into export data. */
export function normalizePiExportModel(
  pi: Record<string, unknown>,
  sourceItems: CommercialItem[],
): PiExportModel {
  const exportSnapshot = piExportSnapshot(pi.terms_snapshot);
  const bank = {
    ...defaultPiBankSnapshot(),
    ...((pi.bank_snapshot as Record<string, unknown>) || {}),
  } as PiBankSnapshot;
  const total = money(number(pi.total));
  const depositPercent = number(pi.deposit_percent);
  const deposit = money((total * depositPercent) / 100);
  const items = [...sourceItems]
    .sort(
      (a, b) =>
        number(a.position) - number(b.position) ||
        String(a.id).localeCompare(String(b.id)),
    )
    .map((item, index) => {
      const product = (item.product_snapshot || {}) as Record<string, unknown>;
      const packing = (item.packing_snapshot || {}) as Record<string, unknown>;
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
    });
  return {
    worksheetName: "ROMIKU PI",
    document: {
      number: text(pi.document_number),
      date: text(pi.document_date),
    },
    currency: pi.currency === "CNY" ? "CNY" : "USD",
    seller: exportSnapshot.seller,
    buyer: savedBuyerSnapshot(pi.counterparty_snapshot),
    commercial: {
      priceTerm: text(pi.price_term),
      shipmentMethod: text(pi.shipment_method),
    },
    payment: {
      depositPercent,
      deposit,
      balance: money(total - deposit),
    },
    totals: {
      totalCtn: items.reduce((sum, item) => sum + item.cartons, 0),
      subtotal: money(items.reduce((sum, item) => sum + item.amount, 0)),
      freight: money(number(pi.freight)),
      total,
    },
    items,
    terms: exportSnapshot.terms_visible
      ? Object.entries(exportSnapshot.terms).map(([key, term]) => ({
          key,
          ...term,
        }))
      : [],
    termsVisible: exportSnapshot.terms_visible,
    bank,
    bankInformationVisible: bank.bank_information_visible !== false,
  };
}
