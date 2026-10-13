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

it("keeps five empty rows in place and appends repeated additions below them", () => {
  const original = [item("A", 1)];
  expect(labels(original)).toEqual([
    "A",
    "empty",
    "empty",
    "empty",
    "empty",
    "empty",
  ]);
  const rows = [...original];
  for (const sku of ["B", "C", "D"]) {
    const empty = initialEmptyLines(rows);
    rows.push(item(sku, nextCommercialPosition(rows, empty)));
  }
  expect(rows.map((row) => row.position)).toEqual([1, 7, 8, 9]);
  expect(labels(rows)).toEqual([
    "A",
    "empty",
    "empty",
    "empty",
    "empty",
    "empty",
    "B",
    "C",
    "D",
  ]);
});

it("appends below current rows after a middle item is deleted", () => {
  const remaining = [item("A", 1), item("C", 3), item("D", 9)];
  remaining.push(
    item("E", nextCommercialPosition(remaining, initialEmptyLines(remaining))),
  );
  expect(labels(remaining).at(-1)).toBe("E");
  expect(remaining.at(-1)?.position).toBe(10);
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
  expect(labels(moved).indexOf("A")).toBeLessThan(labels(moved).indexOf("NEW"));
  expect(labels(moved).at(-1)).toBe("NEW");
});
