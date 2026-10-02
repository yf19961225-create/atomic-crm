import type { DataProvider, RaRecord } from "ra-core";
import type { Values } from "../outbound/WorkflowFields";
import { positiveQuantity } from "../production/productionWorkflow";
import { readRelated } from "../outbound/workflow";
import { withPackingItemUnit } from "./packingExportSnapshot";
import { defaultPackingSellerSnapshot } from "./packingExportSnapshot";

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
const numberOr = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
function sourcePackingValues(
  source: RaRecord,
  remainingQuantity: number,
): Values {
  const packing =
    source.packing_snapshot && typeof source.packing_snapshot === "object"
      ? (source.packing_snapshot as PackingSnapshot)
      : {};
  const qtyPerCarton = numberOr(packing.qty_per_carton, 0);
  const savedCartons = numberOr(packing.cartons, -1);
  // Cartons are only safe to bring over when the source snapshot exactly
  // represented this still-unallocated quantity. A later Packing List may
  // have a partial remainder, which must stay for the user to enter.
  const cartons =
    Number.isInteger(savedCartons) &&
    savedCartons >= 0 &&
    qtyPerCarton > 0 &&
    Number(source.quantity) === remainingQuantity &&
    savedCartons * qtyPerCarton === remainingQuantity
      ? savedCartons
      : 0;
  return {
    quantity: remainingQuantity,
    cartons,
    qty_per_carton: qtyPerCarton > 0 ? qtyPerCarton : null,
    length_cm: numberOr(packing.length_cm),
    width_cm: numberOr(packing.width_cm),
    height_cm: numberOr(packing.height_cm),
    carton_weight_kg: numberOr(packing.carton_weight_kg),
    product_snapshot: structuredClone(source.product_snapshot || {}),
  };
}

/**
 * Creates an Order-backed Packing List and snapshots every currently
 * unallocated source line. Client providers have no transaction primitive,
 * so a failed item write explicitly removes every write made by this call.
 */
export async function createOrderPackingList(
  provider: DataProvider,
  orderId: string,
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
  const { data: packing } = await provider.create("romiku_packing_lists", {
    data: {
      order_id: orderId,
      packing_at: new Date().toISOString(),
      seller_snapshot: defaultPackingSellerSnapshot(),
      buyer_snapshot: structuredClone(order.counterparty_snapshot || {}),
    },
  });
  const created: RaRecord[] = [];
  try {
    for (const source of eligible) {
      const result = await savePackingItem(
        provider,
        packing,
        String(source.id),
        sourcePackingValues(
          source,
          remainingBySource.get(String(source.id)) || 0,
        ),
      );
      created.push(result.data);
    }
  } catch (cause) {
    for (const item of created.reverse())
      await provider
        .delete("romiku_packing_items", { id: item.id })
        .catch(() => undefined);
    await provider
      .delete("romiku_packing_lists", { id: packing.id })
      .catch(() => undefined);
    throw new Error(
      `创建装箱单时无法完整导入订单产品，已撤销本次创建。${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  return packing;
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
  const quantity = positiveQuantity(values.quantity);
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
    return previous
      ? provider.update("romiku_packing_items", {
          id: previous.id,
          data,
          previousData: previous,
        })
      : provider.create("romiku_packing_items", {
          data: {
            ...data,
            packing_list_id: parent.id,
            order_id: parent.order_id,
            source_order_item_id: source.id,
            sanity_product_id: source.sanity_product_id || null,
          },
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
  return previous
    ? provider.update("romiku_packing_items", {
        id: previous.id,
        data,
        previousData: previous,
      })
    : provider.create("romiku_packing_items", {
        data: {
          ...data,
          packing_list_id: parent.id,
          order_id: null,
          source_order_item_id: null,
          sanity_product_id: values.sanity_product_id || null,
        },
      });
}
