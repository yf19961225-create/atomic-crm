import type { CommercialItem } from "./commercialLineItems";

export type EmptyLine = { id: number; position: number };

const position = (value: unknown) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
};
const itemPosition = (item: CommercialItem, index: number) =>
  position(item.position) || index + 1;

/** Empty rows are visual slots; their positions keep later new items below them. */
export function initialEmptyLines(
  items: CommercialItem[],
  count = 5,
): EmptyLine[] {
  const occupied = new Set(items.map(itemPosition));
  const rows: EmptyLine[] = [];
  let next = 1;
  while (rows.length < count) {
    if (!occupied.has(next)) rows.push({ id: rows.length, position: next });
    next++;
  }
  return rows;
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
    ...items.map((item, itemIndex) => ({
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
  const moved = [...items];
  const [item] = moved.splice(sourceIndex, 1);
  moved.splice(destinationIndex, 0, item);
  return moved.map((row, index) => ({
    id: String(row.id),
    position: slots[index] || index + 1,
  }));
}
