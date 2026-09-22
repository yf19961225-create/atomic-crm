import type { DataProvider, RaRecord } from "ra-core";
import type { Values } from "../outbound/WorkflowFields";
import { readRelated } from "../outbound/workflow";

export type ProductionSelection = {
  itemId: string;
  quantity: number;
};
export class ProductionCreationError extends Error {
  constructor(
    message: string,
    public documents: RaRecord[],
  ) {
    super(message);
  }
}
export function positiveQuantity(value: unknown) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0)
    throw new Error("数量必须大于零。");
  return quantity;
}
export async function createProductionOrders(
  provider: DataProvider,
  orderId: string,
  selections: ProductionSelection[],
) {
  if (!orderId || !selections.length)
    throw new Error("请选择订单和至少一个产品项。");
  if (new Set(selections.map((s) => s.itemId)).size !== selections.length)
    throw new Error("每个订单产品项只能选择一次。");
  const sourceItems = await readRelated(provider, "romiku_order_items", {
    order_id: orderId,
  });
  const items: Values[] = [];
  for (const selection of selections) {
    const source = sourceItems.find(
      (item) => String(item.id) === selection.itemId,
    );
    if (!source) throw new Error("所选产品项必须属于该订单。");
    const quantity = positiveQuantity(selection.quantity);
    items.push({
      order_id: orderId,
      source_order_item_id: source.id,
      sanity_product_id: source.sanity_product_id || null,
      sku: source.sku,
      quantity,
      product_snapshot: structuredClone(source.product_snapshot || {}),
      packaging_snapshot: structuredClone(source.packing_snapshot || {}),
    });
  }
  const documents: RaRecord[] = [];
  try {
    const { data } = await provider.create("romiku_production_orders", {
      data: {
        order_id: orderId,
        supplier_id: null,
        supplier_snapshot: null,
        status: "pending",
      },
    });
    documents.push(data);
    for (const item of items)
      await provider.create("romiku_production_items", {
        data: { ...item, production_order_id: data.id },
      });
  } catch (cause) {
    throw new ProductionCreationError(
      `创建已停止。请在再次创建前检查已保存的单据；最后一张单据可能包含未完成的产品项。${cause instanceof Error ? cause.message : String(cause)}`,
      documents,
    );
  }
  return documents;
}

export async function saveProductionItem(
  provider: DataProvider,
  parent: RaRecord,
  sourceId: string,
  values: Values,
  previous?: RaRecord,
) {
  if (
    previous &&
    (previous.production_order_id !== parent.id ||
      previous.source_order_item_id !== sourceId)
  )
    throw new Error("生产产品项的来源不可更改。");
  const { data: source } = await provider.getOne("romiku_order_items", {
    id: sourceId,
  });
  if (source.order_id !== parent.order_id)
    throw new Error("产品项必须属于该订单。");
  const copy = previous || {
    sku: source.sku,
    product_snapshot: structuredClone(source.product_snapshot || {}),
    packaging_snapshot: structuredClone(source.packing_snapshot || {}),
  };
  const data = {
    quantity: positiveQuantity(values.quantity),
    sku: copy.sku,
    product_snapshot: {
      ...copy.product_snapshot,
      ...((values.product_snapshot as Values) || {}),
    },
    packaging_snapshot: {
      ...copy.packaging_snapshot,
      ...((values.packaging_snapshot as Values) || {}),
    },
    production_note_zh: values.production_note_zh || null,
  };
  return previous
    ? provider.update("romiku_production_items", {
        id: previous.id,
        data,
        previousData: previous,
      })
    : provider.create("romiku_production_items", {
        data: {
          ...data,
          production_order_id: parent.id,
          order_id: parent.order_id,
          source_order_item_id: source.id,
          sanity_product_id: source.sanity_product_id || null,
        },
      });
}
