import {
  normalizeMarkingProfile,
  recordValue,
  type Mark,
  type MarkingProfile,
} from "./markingProfile";
export type InstructionLabel = Mark & { id: string; type: string };
export type InstructionSource = {
  kind: string;
  id?: string;
  copied_at?: string;
};
export type ProductionInstructions = MarkingProfile & {
  schema_version: 2;
  initialized_at: string | null;
  source: InstructionSource;
  additional_labels: InstructionLabel[];
  notes: string;
};
export type ItemMarkingOverride = {
  mode: "inherit" | "append" | "replace";
  labels: InstructionLabel[];
  front_mark: Mark;
  side_mark: Mark;
  labeling_requirements: string;
  notes: string;
};
const text = (v: unknown) => (typeof v === "string" ? v : "");
const mark = (v: unknown) =>
  normalizeMarkingProfile({ small_label: v }).small_label;
export const normalizeInstructionLabels = (v: unknown): InstructionLabel[] =>
  Array.isArray(v)
    ? v.map((value, index) => {
        const l = recordValue(value);
        return {
          ...mark(l),
          id: text(l.id) || `label-${index}`,
          type: text(l.type) || "custom",
        };
      })
    : [];
export function normalizeProductionInstructions(
  value: unknown,
): ProductionInstructions {
  const v = recordValue(value),
    source = recordValue(v.source);
  return {
    ...normalizeMarkingProfile(v),
    schema_version: 2,
    initialized_at: text(v.initialized_at) || null,
    source: {
      kind: text(source.kind) || "legacy",
      ...(text(source.id) ? { id: text(source.id) } : {}),
      ...(text(source.copied_at) ? { copied_at: text(source.copied_at) } : {}),
    },
    additional_labels: normalizeInstructionLabels(v.additional_labels),
    notes: text(v.notes),
  };
}
export function normalizeItemMarkingOverride(
  value: unknown,
): ItemMarkingOverride {
  const v = recordValue(value);
  return {
    mode: v.mode === "append" || v.mode === "replace" ? v.mode : "inherit",
    labels: normalizeInstructionLabels(v.labels),
    front_mark: mark(v.front_mark),
    side_mark: mark(v.side_mark),
    labeling_requirements: text(v.labeling_requirements),
    notes: text(v.notes),
  };
}
const combine = (...values: string[]) =>
  values.filter((v) => v.trim()).join("\n");
export function resolveProductionItemMarking(
  productionMarking: unknown,
  itemOverride: unknown,
) {
  const common = normalizeProductionInstructions(productionMarking),
    own = normalizeItemMarkingOverride(itemOverride);
  const labels: InstructionLabel[] = [
    { ...common.small_label, id: "common-small-label", type: "common" },
    ...common.additional_labels,
  ].filter((l) => l.mode !== "none");
  const extras = own.labels.filter((l) => l.mode !== "none");
  return {
    frontMark: own.mode === "replace" ? own.front_mark : common.front_mark,
    sideMark: own.mode === "replace" ? own.side_mark : common.side_mark,
    labels:
      own.mode === "replace"
        ? extras
        : own.mode === "append"
          ? [...labels, ...extras]
          : labels,
    labelingRequirements:
      own.mode === "replace"
        ? own.labeling_requirements
        : own.mode === "append"
          ? combine(common.labeling_requirements, own.labeling_requirements)
          : common.labeling_requirements,
    notes:
      own.mode === "replace"
        ? own.notes
        : own.mode === "append"
          ? combine(common.notes, own.notes)
          : common.notes,
  };
}
/** No customer lookup or notes fallback once the Order snapshot is initialized. */
export function copyOrderProductionInstructions(
  order: Record<string, unknown>,
): ProductionInstructions {
  const saved = recordValue(order.production_defaults_snapshot);
  if (!saved.initialized_at || saved.schema_version !== 2)
    throw new Error("订单生产默认值尚未初始化，请先在订单中确认生产要求。");
  return {
    ...normalizeProductionInstructions(saved),
    initialized_at: new Date().toISOString(),
    source: {
      kind: "order",
      id: String(order.id),
      copied_at: new Date().toISOString(),
    },
  };
}
export const ITEM_XLSX_WARNING = "产品级标签例外当前尚未输出到 Production XLSX";
