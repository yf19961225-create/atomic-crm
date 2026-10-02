import { cartonCbmFromPacking } from "../commercial/commercialLineItems";
import type { ContactSnapshot } from "../orders/orderExportSnapshot";
import { packingContactSnapshot } from "./packingExportSnapshot";

type SavedPackingItem = {
  id?: unknown;
  position?: unknown;
  sku?: unknown;
  quantity?: unknown;
  cartons?: unknown;
  qty_per_carton?: unknown;
  length_cm?: unknown;
  width_cm?: unknown;
  height_cm?: unknown;
  carton_weight_kg?: unknown;
  total_cbm?: unknown;
  total_weight_kg?: unknown;
  product_snapshot?: unknown;
};

export type PackingExportItem = {
  position: number;
  sku: string;
  name: string;
  imageUrl: string;
  specification: string;
  cartons: number;
  qtyPerCarton: number | null;
  unit: string;
  quantity: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  cartonCbm: number | null;
  cartonWeightKg: number;
  totalCbm: number | null;
  totalWeightKg: number | null;
};

export type PackingExportModel = {
  worksheetName: "PACKING LIST";
  document: { number: string; date: string };
  seller: ContactSnapshot;
  buyer: ContactSnapshot;
  items: PackingExportItem[];
  totals: { cartons: number; cbm: number; weightKg: number };
};

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const numeric = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const numericOrNull = (value: unknown) =>
  value === null || value === undefined || value === ""
    ? null
    : Number.isFinite(Number(value))
      ? Number(value)
      : null;
const formatPackingDate = (value: unknown) => {
  const date = new Date(String(value || ""));
  if (!Number.isFinite(date.getTime())) return "";
  const fields = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const part = (type: string) =>
    fields.find((field) => field.type === type)?.value;
  return `${part("year")}.${part("month")}.${part("day")}`;
};

/** Maps only saved Packing List and Packing Item records to XLSX data. */
export function normalizePackingExportModel(
  packing: Record<string, unknown>,
  savedItems: SavedPackingItem[],
): PackingExportModel {
  const items = [...savedItems]
    .sort(
      (left, right) =>
        numeric(left.position) - numeric(right.position) ||
        String(left.id || "").localeCompare(String(right.id || "")),
    )
    .map((item, index) => {
      const product = object(item.product_snapshot);
      const lengthCm = numeric(item.length_cm);
      const widthCm = numeric(item.width_cm);
      const heightCm = numeric(item.height_cm);
      return {
        position: index + 1,
        sku: String(item.sku || ""),
        name: String(product.name || ""),
        imageUrl: String(product.image_url || ""),
        specification: String(product.specification || ""),
        cartons: numeric(item.cartons),
        qtyPerCarton: numericOrNull(item.qty_per_carton),
        unit: String(product.unit || ""),
        quantity: numeric(item.quantity),
        lengthCm,
        widthCm,
        heightCm,
        cartonCbm: cartonCbmFromPacking({
          length_cm: lengthCm,
          width_cm: widthCm,
          height_cm: heightCm,
        }),
        cartonWeightKg: numeric(item.carton_weight_kg),
        totalCbm: numericOrNull(item.total_cbm),
        totalWeightKg: numericOrNull(item.total_weight_kg),
      };
    });
  return {
    worksheetName: "PACKING LIST",
    document: {
      number: String(packing.document_number || ""),
      date: formatPackingDate(packing.packing_at),
    },
    seller: packingContactSnapshot(packing.seller_snapshot),
    buyer: packingContactSnapshot(packing.buyer_snapshot),
    items,
    totals: items.reduce(
      (totals, item) => ({
        cartons: totals.cartons + item.cartons,
        cbm: totals.cbm + (item.totalCbm || 0),
        weightKg: totals.weightKg + (item.totalWeightKg || 0),
      }),
      { cartons: 0, cbm: 0, weightKg: 0 },
    ),
  };
}
