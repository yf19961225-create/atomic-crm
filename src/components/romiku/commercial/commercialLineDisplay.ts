import type { CommercialItem } from "./commercialLineItems";

export type EmptyLine = { id: number; position: number; added?: boolean };

const position = (value: unknown) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
};
const itemPosition = (item: CommercialItem, index: number) =>
  position(item.position) || index + 1;

export function orderedCommercialItems(items: CommercialItem[]) {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        itemPosition(a.item, a.index) - itemPosition(b.item, b.index) ||
        a.index - b.index,
    )
    .map(({ item }) => item);
}

/** Start with one blank at the visual end, never in a gap among saved items. */
export function initialEmptyLines(
  items: CommercialItem[],
  count = 1,
): EmptyLine[] {
  const last = Math.max(0, ...items.map(itemPosition));
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    position: last + index + 1,
  }));
}

export function nextCommercialPosition(
  items: CommercialItem[],
  empty: EmptyLine[],
) {
  return (
    Math.max(
      0,
      ...items.map(itemPosition),
      ...empty.map((row) => row.position),
    ) + 1
  );
}

export function commercialDisplayRows(
  items: CommercialItem[],
  empty: EmptyLine[],
) {
  return [
    ...orderedCommercialItems(items).map((item, itemIndex) => ({
      kind: "item" as const,
      item,
      itemIndex,
      position: itemPosition(item, itemIndex),
    })),
    ...empty.map((row, draftIndex) => ({
      kind: "empty" as const,
      row,
      draftIndex,
      position: row.position,
    })),
  ].sort((a, b) => a.position - b.position || (a.kind === "item" ? -1 : 1));
}

/** Reorder real lines within their visible slots, leaving empty rows in place. */
export function reorderVisibleCommercialItems(
  items: CommercialItem[],
  sourceIndex: number,
  destinationIndex: number,
) {
  const slots = items.map(itemPosition).sort((a, b) => a - b);
  const moved = orderedCommercialItems(items);
  const [item] = moved.splice(sourceIndex, 1);
  moved.splice(destinationIndex, 0, item);
  return moved.map((row, index) => ({
    id: String(row.id),
    position: slots[index] || index + 1,
  }));
}
