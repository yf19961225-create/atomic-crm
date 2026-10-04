import { expect, it } from "vitest";
import {
  normalizeProductionInstructions,
  resolveProductionItemMarking,
} from "./productionInstructions";
const common = {
  small_label: { mode: "text", text: "Made in China" },
  front_mark: { mode: "text", text: "COMMON FRONT" },
  labeling_requirements: "Outer carton",
};
it("inherits unified labels without storing copies on items", () => {
  const resolved = resolveProductionItemMarking(common, { mode: "inherit" });
  expect(resolved.labels.map((x) => x.text)).toEqual(["Made in China"]);
  expect(resolved.frontMark.text).toBe("COMMON FRONT");
});
it("appends Barcode while keeping Made in China and common instructions", () => {
  const resolved = resolveProductionItemMarking(common, {
    mode: "append",
    labels: [{ mode: "text", type: "barcode", text: "Barcode" }],
    labeling_requirements: "On SUN5",
  });
  expect(resolved.labels.map((x) => x.text)).toEqual([
    "Made in China",
    "Barcode",
  ]);
  expect(resolved.labelingRequirements).toBe("Outer carton\nOn SUN5");
});
it("replace uses only the item's own marks, labels and instructions", () => {
  const resolved = resolveProductionItemMarking(common, {
    mode: "replace",
    labels: [{ mode: "text", text: "Customer label" }],
  });
  expect(resolved.labels.map((x) => x.text)).toEqual(["Customer label"]);
  expect(resolved.frontMark.mode).toBe("none");
  expect(resolved.labelingRequirements).toBe("");
});
it("keeps explicit initialized empty metadata and extra fields", () => {
  const source = {
    schema_version: 2,
    initialized_at: "2026-10-03T00:00:00Z",
    source: { kind: "manual" },
    additional_labels: [{ mode: "text", text: "Warning" }],
    notes: "Internal",
  };
  const normalized = normalizeProductionInstructions(source);
  expect(normalized.initialized_at).toBe(source.initialized_at);
  expect(normalized.source).toEqual({ kind: "manual" });
  expect(normalized.small_label.mode).toBe("none");
  expect(normalized.additional_labels[0].text).toBe("Warning");
  expect(normalized.notes).toBe("Internal");
});
it("resolving does not mutate snapshots or their saved asset references", () => {
  const asset = {
    bucket: "romiku-marking-assets",
    path: "user/old.png",
    name: "old",
    mime_type: "image/png",
    size: 42,
  };
  const saved = { small_label: { mode: "image", image_asset: asset } };
  const before = structuredClone(saved);
  const resolved = resolveProductionItemMarking(saved, { mode: "inherit" });
  resolved.labels[0].image_asset!.name = "Changed";
  expect(saved).toEqual(before);
});
