import { describe, expect, it, vi } from "vitest";
import fakeRestDataProvider from "ra-data-fakerest";
import {
  commercialItemAdapter,
  commitCommercialItems,
  type CommercialDocumentKind,
} from "./commercialLineItems";
import { savePackingItem } from "../packing/packingWorkflow";

const list = {
  filter: {},
  pagination: { page: 1, perPage: 100 },
  sort: { field: "id", order: "ASC" as const },
};
const row = (id: string, sku = id) => ({ id, sku, quantity: 1, unit_price: 1 });

// Characterization of remaining backend-contract gaps, not desired atomic behavior.
// These tests must change when a transactional save replaces sequential REST writes.
describe.each<CommercialDocumentKind>(["quote", "pi", "order"])(
  "%s save failure evidence",
  (kind) => {
    const { resource, parentKey } = commercialItemAdapter(kind);
    it("retains successful delete and update when a later create rejects", async () => {
      const saved = [row("remove"), row("keep")];
      const provider = fakeRestDataProvider({ [resource]: saved });
      vi.spyOn(provider, "create").mockRejectedValue(
        new Error("create rejected"),
      );
      await expect(
        commitCommercialItems(provider, kind, "doc", saved, [
          { ...row("keep"), quantity: 2 },
          row("draft-commercial-new"),
        ]),
      ).rejects.toThrow("create rejected");
      expect((await provider.getList(resource, list)).data).toEqual([
        { ...row("keep"), quantity: 2 },
      ]);
    });
    it("duplicates a created draft on retry after the response was lost", async () => {
      const provider = fakeRestDataProvider({ [resource]: [] });
      const create = provider.create.bind(provider);
      vi.spyOn(provider, "create").mockImplementationOnce(
        async (name, params) => {
          await create(name, params);
          throw new Error("timeout after commit");
        },
      );
      const staged = [row("draft-commercial-new", "NEW")];
      await expect(
        commitCommercialItems(provider, kind, "doc", [], staged),
      ).rejects.toThrow("timeout");
      expect((await provider.getList(resource, list)).data).toHaveLength(1);
      await commitCommercialItems(provider, kind, "doc", [], staged);
      const stored = (await provider.getList(resource, list)).data;
      expect(stored).toHaveLength(2);
      expect(
        stored.every((item) => item.sku === "NEW" && item[parentKey] === "doc"),
      ).toBe(true);
      expect(stored[0].id).not.toBe(stored[1].id);
    });
    it("overwrites another editor's quantity from a stale full row", async () => {
      const original = row("keep");
      const provider = fakeRestDataProvider({ [resource]: [original] });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let entered!: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const update = provider.update.bind(provider);
      vi.spyOn(provider, "update").mockImplementationOnce(
        async (name, params) => {
          entered();
          await gate;
          return update(name, params);
        },
      );
      const slow = commitCommercialItems(
        provider,
        kind,
        "doc",
        [original],
        [{ ...original, sku: "RENAMED" }],
      );
      await started;
      await commitCommercialItems(
        provider,
        kind,
        "doc",
        [original],
        [{ ...original, quantity: 9 }],
      );
      expect(
        (await provider.getOne(resource, { id: "keep" })).data.quantity,
      ).toBe(9);
      release();
      await slow;
      expect(
        (await provider.getOne(resource, { id: "keep" })).data,
      ).toMatchObject({ sku: "RENAMED", quantity: 1 });
    });
  },
);

it("packing sequential saves retain the first row after later validation failure", async () => {
  const provider = fakeRestDataProvider({ romiku_packing_items: [] });
  const parent = { id: "packing", order_id: null };
  const values = { sku: "A", quantity: 1, cartons: 1, qty_per_carton: 1 };
  await savePackingItem(provider, parent, "", values);
  await expect(
    savePackingItem(provider, parent, "", { ...values, sku: "B", cartons: -1 }),
  ).rejects.toThrow();
  expect(
    (await provider.getList("romiku_packing_items", list)).data.map(
      (item) => item.sku,
    ),
  ).toEqual(["A"]);
});
it("packing create also duplicates on retry after lost response", async () => {
  const provider = fakeRestDataProvider({ romiku_packing_items: [] });
  const create = provider.create.bind(provider);
  vi.spyOn(provider, "create").mockImplementationOnce(async (name, params) => {
    await create(name, params);
    throw new Error("timeout after commit");
  });
  const parent = { id: "packing", order_id: null };
  const values = { sku: "A", quantity: 1, cartons: 1, qty_per_carton: 1 };
  await expect(savePackingItem(provider, parent, "", values)).rejects.toThrow(
    "timeout",
  );
  await savePackingItem(provider, parent, "", values);
  expect(
    (await provider.getList("romiku_packing_items", list)).data,
  ).toHaveLength(2);
});
