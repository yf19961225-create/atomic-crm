import { expect, it } from "vitest";
import {
  commercialDisplayRows,
  initialEmptyLines,
  nextCommercialPosition,
  reorderVisibleCommercialItems,
} from "./commercialLineDisplay";
import type { CommercialItem } from "./commercialLineItems";

const item = (id: string, position: number): CommercialItem => ({
  id,
  position,
  sku: id,
  quantity: 1,
  unit_price: 1,
});
const labels = (items: CommercialItem[]) =>
  commercialDisplayRows(items, initialEmptyLines(items)).map((row) =>
    row.kind === "item" ? row.item.sku : "empty",
  );

it("starts with one empty row after saved items and appends blanks below it", () => {
  const original = [item("A", 1)];
  expect(labels(original)).toEqual(["A", "empty"]);
  const blanks = initialEmptyLines(original);
  blanks.push({ id: 1, position: nextCommercialPosition(original, blanks) });
  blanks.push({ id: 2, position: nextCommercialPosition(original, blanks) });
  expect(
    commercialDisplayRows(original, blanks).map((row) => row.position),
  ).toEqual([1, 2, 3, 4]);
  expect(initialEmptyLines([item("A", 1), item("C", 3)])[0].position).toBe(4);
});

it("hydrates an empty row at its own position without moving later blanks", () => {
  const blanks = initialEmptyLines([], 3);
  const [first, second, third] = blanks;
  expect(first.position).toBe(1);
  const selectedFirst = item("SUN002", first.position);
  expect(
    commercialDisplayRows([selectedFirst], [second, third]).map((row) =>
      row.kind === "item" ? row.item.sku : "empty",
    ),
  ).toEqual(["SUN002", "empty", "empty"]);
  const selectedSecond = item("G02", second.position);
  expect(
    commercialDisplayRows([selectedFirst, selectedSecond], [third]).map(
      (row) => (row.kind === "item" ? row.item.sku : "empty"),
    ),
  ).toEqual(["SUN002", "G02", "empty"]);
  // Selection can finish out of order because a product lookup is async.
  expect(
    commercialDisplayRows([selectedSecond, selectedFirst], [third]).map(
      (row) => (row.kind === "item" ? row.item.sku : "empty"),
    ),
  ).toEqual(["SUN002", "G02", "empty"]);
});

it("drag reorder follows visible positions even when item array insertion order differs", () => {
  expect(
    reorderVisibleCommercialItems(
      [item("G02", 2), item("SUN002", 1), item("ABC", 3)],
      0,
      2,
    ),
  ).toEqual([
    { id: "G02", position: 1 },
    { id: "ABC", position: 2 },
    { id: "SUN002", position: 3 },
  ]);
});

it("appends below current rows after a middle item is deleted", () => {
  const remaining = [item("A", 1), item("C", 3), item("D", 9)];
  remaining.push(
    item("E", nextCommercialPosition(remaining, initialEmptyLines(remaining))),
  );
  expect(commercialDisplayRows(remaining, []).at(-1)?.kind).toBe("item");
  expect(remaining.at(-1)?.position).toBe(11);
});

it("keeps visual item slots after a drag and appends after the dragged last item", () => {
  const rows = [item("A", 1), item("C", 2), item("B", 7)];
  const order = reorderVisibleCommercialItems(rows, 0, 2);
  expect(order).toEqual([
    { id: "C", position: 1 },
    { id: "B", position: 2 },
    { id: "A", position: 7 },
  ]);
  const moved = order.map(({ id, position }) => item(id, position));
  moved.push(
    item("NEW", nextCommercialPosition(moved, initialEmptyLines(moved))),
  );
  const reordered = commercialDisplayRows(moved, []).map((row) =>
    row.kind === "item" ? row.item.sku : "empty",
  );
  expect(reordered.indexOf("A")).toBeLessThan(reordered.indexOf("NEW"));
  expect(reordered.at(-1)).toBe("NEW");
});
