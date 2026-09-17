import type { DataProvider, RaRecord } from "ra-core";
import type { Values } from "../outbound/WorkflowFields";
import { readRelated } from "../outbound/workflow";

export type ProductionSelection = {
  itemId: string;
  supplierId: string;
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
    throw new Error("Quantity must be greater than zero.");
  return quantity;
}
export async function createProductionOrders(
  provider: DataProvider,
  orderId: string,
  selections: ProductionSelection[],
) {
  if (!orderId || !selections.length)
    throw new Error("Choose an Order and at least one item.");
  if (selections.some((s) => !s.supplierId))
    throw new Error("Choose one supplier for each selected item.");
  if (new Set(selections.map((s) => s.itemId)).size !== selections.length)
    throw new Error("Select each Order item once.");
  const sourceItems = await readRelated(provider, "romiku_order_items", {
    order_id: orderId,
  });
  const groups = new Map<string, { supplier: RaRecord; items: Values[] }>();
  // Validate and copy every group before creating the first document.
  for (const selection of selections) {
    const source = sourceItems.find(
      (item) => String(item.id) === selection.itemId,
    );
    if (!source) throw new Error("Selected item must belong to this Order.");
    const quantity = positiveQuantity(selection.quantity);
    if (!groups.has(selection.supplierId)) {
      const { data } = await provider.getOne("romiku_suppliers", {
        id: selection.supplierId,
      });
      groups.set(selection.supplierId, { supplier: data, items: [] });
    }
    groups.get(selection.supplierId)!.items.push({
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
    for (const [supplierId, group] of groups) {
      const { data } = await provider.create("romiku_production_orders", {
        data: {
          order_id: orderId,
          supplier_id: supplierId,
          supplier_snapshot: structuredClone(group.supplier),
          status: "pending",
        },
      });
      documents.push(data);
      for (const item of group.items)
        await provider.create("romiku_production_items", {
          data: { ...item, production_order_id: data.id },
        });
    }
  } catch (cause) {
    throw new ProductionCreationError(
      `Creation stopped. Review saved documents before creating again; the last document may have incomplete items. ${cause instanceof Error ? cause.message : String(cause)}`,
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
    throw new Error("Production item source cannot change.");
  const { data: source } = await provider.getOne("romiku_order_items", {
    id: sourceId,
  });
  if (source.order_id !== parent.order_id)
    throw new Error("Item must belong to the Order.");
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
