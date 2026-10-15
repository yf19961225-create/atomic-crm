import type { RaRecord } from "ra-core";
import { productionDueDateInput } from "./productionDueDate";
import {
  normalizeProductionInstructions,
  normalizeItemMarkingOverride,
  type InstructionLabel,
} from "../marking/productionInstructions";

const text = (value: unknown) => (value == null ? "" : String(value));
const number = (value: unknown) => {
  if (value == null || value === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : String(value);
};
const labels = (values: InstructionLabel[]) =>
  values.map(({ id: _id, ...label }) => label);

// A comparison-only projection: never used as a save payload. Keep query,
// concurrency and generated UI identifiers outside the editable baseline.
export function productionDraftSnapshot(record: RaRecord, items: RaRecord[]) {
  const profile = normalizeProductionInstructions(record.marking_snapshot);
  return JSON.stringify({
    header: Object.fromEntries(
      [
        "document_number",
        "name",
        "factory_due_at",
        "notes",
        "anomaly_notes",
      ].map((key) => [
        key,
        key === "factory_due_at"
          ? productionDueDateInput(record[key])
          : text(record[key]),
      ]),
    ),
    status: record.status || "pending_send",
    instructions: {
      front_mark: profile.front_mark,
      side_mark: profile.side_mark,
      small_label: profile.small_label,
      labeling_requirements: profile.labeling_requirements,
      production_requirements: profile.production_requirements,
      notes: profile.notes,
      additional_labels: labels(profile.additional_labels),
    },
    items: items.map((line) => {
      const own = normalizeItemMarkingOverride(line.marking_override);
      const fields = own.field_overrides || {};
      return {
        source: text(line.source_order_item_id),
        product: ["name", "image_url", "specification"].map((key) =>
          text(line.product_snapshot?.[key]),
        ),
        cartons: number(
          line.packaging_snapshot?.cartons ??
            line.packaging_snapshot?.carton_qty,
        ),
        qty_per_carton: number(line.packaging_snapshot?.qty_per_carton),
        quantity: number(line.quantity),
        barcode_number: text(line.barcode_number),
        production_note_zh: text(line.production_note_zh),
        marking: {
          mode: own.mode,
          front_mark: own.front_mark,
          side_mark: own.side_mark,
          labeling_requirements: own.labeling_requirements,
          notes: own.notes,
          labels: labels(own.labels),
          additional_labels: labels(own.additional_labels || []),
          fields: (["front_mark", "side_mark", "small_label"] as const).map(
            (key) => {
              const field = fields[key];
              return field?.mode === "override"
                ? { mode: field.mode, mark: field.mark ?? null }
                : { mode: field?.mode || "inherit" };
            },
          ),
          placement:
            fields.labeling_requirements?.mode &&
            fields.labeling_requirements.mode !== "inherit"
              ? {
                  mode: fields.labeling_requirements.mode,
                  text: text(fields.labeling_requirements.text),
                }
              : { mode: "inherit" },
        },
      };
    }),
  });
}
