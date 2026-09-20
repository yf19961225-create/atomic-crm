import type { DataProvider, Identifier, RaRecord } from "ra-core";
import type { Values } from "../outbound/WorkflowFields";
import { quoteItemWrite, quoteTotals } from "../quotes/quoteWorkflow";

export type CommercialDocumentKind = "quote" | "pi" | "order";
export type CommercialItem = RaRecord & {
  position?: number | null;
  sku: string;
  quantity: number;
  unit_price: number;
};
export type CommercialItemWrite = ReturnType<typeof quoteItemWrite>;

const config = {
  quote: { resource: "romiku_quote_items", parentKey: "quote_id" },
  pi: { resource: "romiku_pi_items", parentKey: "pi_id" },
  order: { resource: "romiku_order_items", parentKey: "order_id" },
} as const;

export function commercialItemAdapter(kind: CommercialDocumentKind) {
  return config[kind];
}

export async function readCommercialItems(
  provider: DataProvider,
  kind: CommercialDocumentKind,
  parentId: string,
) {
  const adapter = commercialItemAdapter(kind);
  const records: CommercialItem[] = [];
  for (let page = 1; ; page++) {
    const result = await provider.getList<CommercialItem>(adapter.resource, {
      filter: { [adapter.parentKey]: parentId },
      pagination: { page, perPage: 100 },
      sort: { field: "position", order: "ASC" },
    });
    records.push(...result.data);
    if (
      result.data.length < 100 ||
      (result.total && records.length >= result.total)
    )
      return records.sort(
        (a, b) =>
          Number(a.position || 0) - Number(b.position || 0) ||
          String(a.id).localeCompare(String(b.id)),
      );
  }
}

export function nextPositions<
  T extends { id: Identifier; position?: number | null },
>(items: T[], sourceIndex: number, destinationIndex: number) {
  const next = [...items];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(destinationIndex, 0, moved);
  return next.map((item, index) => ({
    id: String(item.id),
    position: index + 1,
  }));
}

export function changedPositions(
  previous: Array<{ id: Identifier; position?: number | null }>,
  next: Array<{ id: string; position: number }>,
) {
  const prior = new Map(
    previous.map((item) => [item.id, Number(item.position || 0)]),
  );
  return next.filter((item) => prior.get(item.id) !== item.position);
}

export async function reorderCommercialItems(
  provider: DataProvider,
  kind: CommercialDocumentKind,
  previous: CommercialItem[],
  next: Array<{ id: string; position: number }>,
) {
  const adapter = commercialItemAdapter(kind);
  const changed = changedPositions(previous, next);
  await Promise.all(
    changed.map((item) => {
      const previousData = previous.find((row) => row.id === item.id);
      if (!previousData) throw new Error("无法更新不存在的产品项。");
      return provider.update(adapter.resource, {
        id: item.id,
        data: { position: item.position },
        previousData,
      });
    }),
  );
  return changed;
}

export function quantityFromPacking(values: {
  cartons?: unknown;
  qty_per_carton?: unknown;
}) {
  const cartons = Number(values.cartons || 0);
  const qty = Number(values.qty_per_carton || 0);
  return Number.isFinite(cartons * qty) ? cartons * qty : 0;
}

export function applyManualQuantity<T extends Record<string, unknown>>(
  packing: T,
  quantity: unknown,
) {
  return { ...packing, quantity: Number(quantity) };
}

export function lineAmount(quantity: unknown, unitPrice: unknown) {
  const scaled = (value: unknown) =>
    BigInt(
      Number(value || 0)
        .toFixed(4)
        .replace(".", ""),
    );
  return (
    Number((scaled(quantity) * scaled(unitPrice) + 500000n) / 1000000n) / 100
  );
}

export function commercialTotals(items: Values[], document: Values) {
  return quoteTotals(items, document);
}

export function clearProductIdentityForManualSku<
  T extends Record<string, unknown>,
>(item: T, sku: unknown) {
  return {
    ...item,
    sku: String(sku || "").trim(),
    sanity_product_id: null,
    product_snapshot: {},
  };
}

export const commercialItemWrite = quoteItemWrite;

const draftItemPrefix = "draft-commercial-";

export function isDraftCommercialItem(item: Pick<CommercialItem, "id">) {
  return String(item.id).startsWith(draftItemPrefix);
}

export function newDraftCommercialItemId() {
  return `${draftItemPrefix}${crypto.randomUUID()}`;
}

function withoutId(item: CommercialItem) {
  const { id: _id, ...data } = item;
  return data;
}

function sameItem(left: CommercialItem, right: CommercialItem) {
  return JSON.stringify(withoutId(left)) === JSON.stringify(withoutId(right));
}

/**
 * Applies a whole document's staged item changes at Save time.  The caller
 * owns the editing session; this helper deliberately has no UI state and
 * never mutates while a user is typing.
 */
export async function commitCommercialItems(
  provider: DataProvider,
  kind: CommercialDocumentKind,
  documentId: string,
  savedItems: CommercialItem[],
  stagedItems: CommercialItem[],
) {
  const adapter = commercialItemAdapter(kind);
  const stagedIds = new Set(
    stagedItems
      .filter((item) => !isDraftCommercialItem(item))
      .map((item) => item.id),
  );
  const deleted = savedItems.filter((item) => !stagedIds.has(item.id));
  const updates = stagedItems.filter((item) => {
    if (isDraftCommercialItem(item)) return false;
    const saved = savedItems.find((candidate) => candidate.id === item.id);
    return saved != null && !sameItem(saved, item);
  });
  const creates = stagedItems.filter(isDraftCommercialItem);

  for (const item of deleted)
    await provider.delete(adapter.resource, {
      id: item.id,
      previousData: item,
    });
  for (const item of updates)
    await provider.update(adapter.resource, {
      id: item.id,
      data: withoutId(item),
      previousData: savedItems.find((candidate) => candidate.id === item.id),
    });
  for (const item of creates)
    await provider.create(adapter.resource, {
      data: { ...withoutId(item), [adapter.parentKey]: documentId },
    });
}
