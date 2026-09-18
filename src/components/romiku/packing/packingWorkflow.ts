import type { DataProvider, RaRecord } from "ra-core";
import type { Values } from "../outbound/WorkflowFields";
import { positiveQuantity } from "../production/productionWorkflow";

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
  if (
    previous &&
    (previous.packing_list_id !== parent.id ||
      previous.order_id !== parent.order_id ||
      previous.source_order_item_id !== sourceId)
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
  data.product_snapshot = {
    ...structuredClone(
      previous?.product_snapshot || source.product_snapshot || {},
    ),
    ...((values.product_snapshot as Values) || {}),
  };
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
