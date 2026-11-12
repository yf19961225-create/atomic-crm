import {
  readDocumentSnapshot,
  saveDocumentAtomically,
} from "../commercial/atomicDocumentSave";
import type { DataProvider, RaRecord } from "ra-core";
import type { Values } from "../outbound/WorkflowFields";
import { positiveQuantity } from "../production/productionWorkflow";
import { readRelated } from "../outbound/workflow";
import {
  defaultPackingSellerSnapshot,
  withPackingItemUnit,
} from "./packingExportSnapshot";

const dimensions = [
  "cartons",
  "length_cm",
  "width_cm",
  "height_cm",
  "carton_weight_kg",
];
const dimensionLabels: Record<(typeof dimensions)[number], string> = {
  cartons: "箱数",
  length_cm: "长度",
  width_cm: "宽度",
  height_cm: "高度",
  carton_weight_kg: "每箱重量",
};

type PackingSnapshot = Record<string, unknown>;
/** Legacy rows retain their historical id order; positioned rows follow it. */
export async function readPackingItems(
  provider: DataProvider,
  packingListId: string,
) {
  const rows = await readRelated(provider, "romiku_packing_items", {
    packing_list_id: packingListId,
  });
  return rows.sort((a, b) => {
    const aPosition = Number(a.position) > 0 ? Number(a.position) : null;
    const bPosition = Number(b.position) > 0 ? Number(b.position) : null;
    if (aPosition === null && bPosition !== null) return -1;
    if (aPosition !== null && bPosition === null) return 1;
    if (aPosition !== null && bPosition !== null && aPosition !== bPosition)
      return aPosition - bPosition;
    return String(a.id).localeCompare(String(b.id));
  });
}

async function nextPackingPosition(
  provider: DataProvider,
  packingListId: string,
) {
  const rows = await readPackingItems(provider, packingListId);
  return (
    Math.max(rows.length, ...rows.map((row) => Number(row.position) || 0)) + 1
  );
}
const numberOr = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const positive = (value: unknown) => {
  const valueAsNumber = numberOr(value, 0);
  return valueAsNumber > 0 ? valueAsNumber : undefined;
};

/** Standard full-carton quantity, at the precision stored by PostgreSQL. */
export function packingQuantity(item: Record<string, unknown>): number {
  return (
    Math.round(
      numberOr(item.cartons) * numberOr(item.qty_per_carton) * 10_000,
    ) / 10_000
  );
}

/** The single saved-default policy used by all Packing item creation paths. */
export function resolvePackingItemDefaults(
  source: Record<string, unknown>,
  remainingQuantity: number,
  supplier?: Pick<
    SupplierDefaults,
    "qtyPerCarton" | "lengthCm" | "widthCm" | "heightCm" | "cartonWeightKg"
  >,
): Values {
  const packing =
    source.packing_snapshot && typeof source.packing_snapshot === "object"
      ? (source.packing_snapshot as PackingSnapshot)
      : {};
  const qtyPerCarton =
    positive(packing.qty_per_carton) ?? positive(supplier?.qtyPerCarton);
  const length =
    positive(packing.length_cm) ?? positive(supplier?.lengthCm) ?? 0;
  const width = positive(packing.width_cm) ?? positive(supplier?.widthCm) ?? 0;
  const height =
    positive(packing.height_cm) ?? positive(supplier?.heightCm) ?? 0;
  const weight =
    positive(packing.carton_weight_kg) ??
    positive(supplier?.cartonWeightKg) ??
    0;
  const savedCartons = numberOr(packing.cartons, -1);
  // Cartons are only safe to bring over when the source snapshot exactly
  // represented this still-unallocated quantity. A later Packing List may
  // have a partial remainder, which must stay for the user to enter.
  const cartons =
    Number.isInteger(savedCartons) &&
    savedCartons >= 0 &&
    qtyPerCarton != null &&
    Number(source.quantity) === remainingQuantity &&
    savedCartons * qtyPerCarton === remainingQuantity
      ? savedCartons
      : 0;
  return {
    quantity: remainingQuantity,
    cartons,
    qty_per_carton: qtyPerCarton ?? null,
    length_cm: length,
    width_cm: width,
    height_cm: height,
    carton_weight_kg: weight,
  };
}

type SupplierDefaults = {
  qtyPerCarton?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  cartonWeightKg?: number | null;
};
type SupplierDefaultsLoader = (
  provider: DataProvider,
  sources: RaRecord[],
) => Promise<Map<string, SupplierDefaults | undefined>>;

/** One batched supplier read for the entire Order; never one query per row. */
export const loadOrderPackingSupplierDefaults: SupplierDefaultsLoader = async (
  provider,
  sources,
) => {
  const suppliers = await readRelated(provider, "romiku_product_suppliers", {});
  return new Map(
    sources.map((source) => {
      const matched = suppliers.filter(
        (supplier) =>
          supplier.sanity_product_id === source.sanity_product_id ||
          (!supplier.sanity_product_id && supplier.sku === source.sku),
      );
      const selected =
        matched.find((supplier) => supplier.preferred) ??
        (matched.length === 1 ? matched[0] : undefined);
      return [
        String(source.id),
        selected && {
          qtyPerCarton: selected.qty_per_carton,
          lengthCm: selected.length_cm,
          widthCm: selected.width_cm,
          heightCm: selected.height_cm,
          cartonWeightKg: selected.carton_weight_kg,
        },
      ];
    }),
  );
};

/**
 * Creates an Order-backed Packing List and snapshots every currently
 * unallocated source line in one server transaction.
 */
export async function prepareOrderPackingList(
  provider: DataProvider,
  orderId: string,
  loadSupplierDefaults: SupplierDefaultsLoader = loadOrderPackingSupplierDefaults,
) {
  if (!orderId) throw new Error("请选择订单。");
  const [{ data: order }, sourceItems, remainingItems] = await Promise.all([
    provider.getOne("romiku_orders", { id: orderId }),
    readRelated(provider, "romiku_order_items", { order_id: orderId }),
    readRelated(provider, "romiku_order_item_remaining", { order_id: orderId }),
  ]);
  const remainingBySource = new Map(
    remainingItems.map((item) => [
      String(item.id),
      numberOr(item.remaining_quantity),
    ]),
  );
  const eligible = sourceItems.filter(
    (source) => (remainingBySource.get(String(source.id)) || 0) > 0,
  );
  const supplierDefaults = await loadSupplierDefaults(provider, eligible);
  return {
    kind: "packing" as const,
    documentId: crypto.randomUUID(),
    expectedRevision: 0,
    header: {
      order_id: orderId,
      packing_at: new Date().toISOString(),
      seller_snapshot: defaultPackingSellerSnapshot(),
      buyer_snapshot: structuredClone(order.counterparty_snapshot || {}),
    },
    items: eligible.map((source, index) => ({
      id: crypto.randomUUID(),
      position: index + 1,
      source_order_item_id: source.id,
      sanity_product_id: source.sanity_product_id || null,
      sku: source.sku,
      product_snapshot: structuredClone(source.product_snapshot || {}),
      ...resolvePackingItemDefaults(
        source,
        remainingBySource.get(String(source.id)) || 0,
        supplierDefaults.get(String(source.id)),
      ),
    })),
  };
}
export async function createOrderPackingList(
  provider: DataProvider,
  orderId: string,
  loadSupplierDefaults: SupplierDefaultsLoader = loadOrderPackingSupplierDefaults,
) {
  const result = await saveDocumentAtomically(
    provider,
    await prepareOrderPackingList(provider, orderId, loadSupplierDefaults),
  );
  return result.header;
}
export function packingTotals(items: Values[]) {
  return items.reduce<{ cartons: number; cbm: number; weight: number }>(
    (total, item) => ({
      cartons: total.cartons + Number(item.cartons || 0),
      cbm:
        total.cbm +
        (Number(item.length_cm || 0) *
          Number(item.width_cm || 0) *
          Number(item.height_cm || 0) *
          Number(item.cartons || 0)) /
          1_000_000,
      weight:
        total.weight +
        Number(item.carton_weight_kg || 0) * Number(item.cartons || 0),
    }),
    { cartons: 0, cbm: 0, weight: 0 },
  );
}
export async function savePackingItem(
  provider: DataProvider,
  parent: RaRecord,
  sourceId: string,
  values: Values,
  previous?: RaRecord,
) {
  const isOrderBacked = Boolean(parent.order_id);
  if (
    previous &&
    (previous.packing_list_id !== parent.id ||
      (previous.order_id || null) !== (parent.order_id || null) ||
      String(previous.source_order_item_id || "") !== sourceId)
  )
    throw new Error("装箱产品项的来源不可更改。");
  const packing = { ...previous, ...values };
  // Unconfigured Order imports retain the source remainder until the user
  // supplies a carton plan. A configured plan always owns its saved quantity.
  const quantity = positiveQuantity(
    Number(packing.cartons) > 0 && Number(packing.qty_per_carton) > 0
      ? packingQuantity(packing)
      : values.quantity,
  );
  const data: Values = { quantity };
  for (const key of dimensions) {
    const value = Number(values[key] ?? previous?.[key] ?? 0);
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      (key === "cartons" && !Number.isInteger(value))
    )
      throw new Error(`请输入有效的非负${dimensionLabels[key]}。`);
    data[key] = value;
  }
  data.qty_per_carton =
    values.qty_per_carton === "" || values.qty_per_carton == null
      ? null
      : positiveQuantity(values.qty_per_carton);
  data.remark = values.remark || null;
  if (!previous)
    data.position = await nextPackingPosition(provider, String(parent.id));
  if (isOrderBacked) {
    const { data: source } = await provider.getOne("romiku_order_items", {
      id: sourceId,
    });
    if (source.order_id !== parent.order_id)
      throw new Error("装箱来源必须属于该订单。");
    // Fresh server availability catches stale forms; the Task2 trigger also serializes concurrent saves.
    const { data: remaining } = await provider.getOne(
      "romiku_order_item_remaining",
      { id: sourceId },
    );
    const available =
      Number(remaining.remaining_quantity) + Number(previous?.quantity || 0);
    if (!Number.isFinite(available) || quantity > available)
      throw new Error(`数量超过剩余可装箱数量（${available}）。`);
    data.sku = previous?.sku || source.sku;
    const productSnapshot = {
      ...structuredClone(
        previous?.product_snapshot || source.product_snapshot || {},
      ),
      ...((values.product_snapshot as Values) || {}),
    };
    data.product_snapshot = Object.hasOwn(productSnapshot, "unit")
      ? withPackingItemUnit(productSnapshot, String(productSnapshot.unit || ""))
      : productSnapshot;
    return savePackingRow(provider, parent, {
      ...previous,
      ...data,
      id: previous?.id || crypto.randomUUID(),
      source_order_item_id: source.id,
      sanity_product_id:
        previous?.sanity_product_id || source.sanity_product_id || null,
    });
  }
  if (sourceId) throw new Error("独立装箱单不能关联订单产品项。");
  const sku = String(values.sku || previous?.sku || "").trim();
  if (!sku) throw new Error("请选择产品。");
  data.sku = sku;
  const productSnapshot = {
    ...structuredClone(previous?.product_snapshot || {}),
    ...((values.product_snapshot as Values) || {}),
  };
  data.product_snapshot = Object.hasOwn(productSnapshot, "unit")
    ? withPackingItemUnit(productSnapshot, String(productSnapshot.unit || ""))
    : productSnapshot;
  return savePackingRow(provider, parent, {
    ...previous,
    ...data,
    id: previous?.id || crypto.randomUUID(),
    source_order_item_id: null,
    sanity_product_id:
      previous?.sanity_product_id || values.sanity_product_id || null,
  });
}

export function packingItemPayload(item: Record<string, unknown>) {
  return Object.fromEntries(
    [
      "id",
      "position",
      "source_order_item_id",
      "sanity_product_id",
      "sku",
      "product_snapshot",
      "quantity",
      "cartons",
      "qty_per_carton",
      "length_cm",
      "width_cm",
      "height_cm",
      "carton_weight_kg",
      "remark",
    ]
      .filter((key) => item[key] !== undefined)
      .map((key) => [key, item[key]]),
  );
}

async function savePackingRow(
  provider: DataProvider,
  parent: RaRecord,
  row: RaRecord,
) {
  const snapshot = await readDocumentSnapshot(
    provider,
    "packing",
    String(parent.id),
  );
  const result = await saveDocumentAtomically(provider, {
    kind: "packing",
    documentId: String(parent.id),
    expectedRevision: Number(parent.revision),
    header: {},
    items: [...snapshot.items.filter((item) => item.id !== row.id), row].map(
      packingItemPayload,
    ),
  });
  return { data: result.items.find((item) => item.id === row.id)! };
}
