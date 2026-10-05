import { expect, it } from "vitest";
import { normalizeProductionExportModel } from "./productionExportModel";
import {
  createProductionMarkingSnapshot,
  normalizeMarkingProfile,
} from "../marking/markingProfile";

it("uses only saved production quantities, descriptions, positions and marking", () => {
  const result = normalizeProductionExportModel(
    {
      document_number: "OD261003001-P01",
      marking_snapshot: {
        side_mark: { mode: "text", text: "Saved SIDE" },
        labeling_requirements: "Label here",
        production_requirements: "Saved requirements",
      },
    },
    [
      {
        id: "b",
        position: 2,
        sku: "B",
        quantity: 150,
        packaging_snapshot: { cartons: 5, qty_per_carton: 32 },
        product_snapshot: { name: "Saved B", specification: "48W" },
        production_note_zh: "Factory note",
      },
      {
        id: "a",
        position: 1,
        sku: "A",
        quantity: 2,
        packaging_snapshot: { carton_qty: 1 },
        product_snapshot: {
          name: "Saved A",
          image_url: "https://example.com/old.jpg",
        },
      },
    ],
  );
  expect(result.document.number).toBe("OD261003001-P01");
  expect(result.items.map((i) => i.sku)).toEqual(["A", "B"]);
  expect(result.items[1]).toMatchObject({
    position: 2,
    quantity: 150,
    cartons: 5,
    qtyPerCarton: 32,
    description: "Saved B\n48W\nFactory note",
  });
  expect(result.totals).toEqual({ cartons: 6, quantity: 152 });
  expect(result.requirements).toBe("Saved requirements");
  expect(result.marking.side_mark.text).toBe("Saved SIDE");
});
it("defaults modes from saved data without retaining mutable URLs or base64 assets", () => {
  const value = normalizeMarkingProfile({
    front_mark: { text: "Front" },
    side_mark: { mode: "none", text: "Hidden" },
    small_label: {
      image_asset: {
        bucket: "attachments",
        path: "mutable.png",
        src: "data:image/png;base64,abc",
      },
    },
  });
  expect(value.front_mark.mode).toBe("text");
  expect(value.side_mark.mode).toBe("none");
  expect(value.small_label.image_asset).toBeNull();
});
it("copies saved source marking for an Order without a formal customer", () => {
  const source = {
    marking_snapshot: {
      front_mark: { text: "Source front" },
      production_requirements: "Source requirement",
    },
  };
  const snapshot = createProductionMarkingSnapshot(source);
  source.marking_snapshot.front_mark.text = "Later";
  expect(snapshot.front_mark.text).toBe("Source front");
  expect(snapshot.production_requirements).toBe("Source requirement");
});
it("copies legacy customer requirements from an uninitialized migrated profile but respects an explicitly cleared profile", () => {
  const customer = {
    marking_profile: {},
    requirements: {
      shipping_marks: "Legacy front",
      product_labels: "Legacy label",
      packaging: "Legacy packing",
    },
  };
  const inherited = createProductionMarkingSnapshot({}, customer);
  expect(inherited.front_mark).toMatchObject({
    mode: "text",
    text: "Legacy front",
  });
  expect(inherited.small_label.text).toBe("Legacy label");
  expect(inherited.production_requirements).toBe("Legacy packing");
  const cleared = createProductionMarkingSnapshot(
    {},
    {
      ...customer,
      marking_profile: {
        version: 1,
        front_mark: { mode: "none", text: "" },
        production_requirements: "",
      },
    },
  );
  expect(cleared.front_mark).toMatchObject({ mode: "none", text: "" });
  expect(cleared.production_requirements).toBe("");
});

it("exports only saved item barcode, never source/product master or legacy labels", () => {
  const item = {
    barcode_number: "0123456789012",
    product_snapshot: { barcode_number: "4006381333931" },
    marking_override: { labels: [{ mode: "text", text: "1234567890128" }] },
  };
  expect(
    normalizeProductionExportModel({}, [item]).items[0].barcodeNumber,
  ).toBe("0123456789012");
  expect(
    normalizeProductionExportModel({}, [
      { product_snapshot: item.product_snapshot },
    ]).items[0].barcodeNumber,
  ).toBeNull();
});
