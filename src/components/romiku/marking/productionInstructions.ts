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
export type MarkFieldOverride = {
  mode: "inherit" | "override" | "none";
  mark?: Mark;
};
export type TextFieldOverride = {
  mode: "inherit" | "append" | "replace" | "none";
  text?: string;
};
export type ItemFieldOverrides = Partial<
  Record<"front_mark" | "side_mark" | "small_label", MarkFieldOverride>
> & { labeling_requirements?: TextFieldOverride };
export type ItemMarkingOverride = {
  mode: "inherit" | "append" | "replace";
  labels: InstructionLabel[];
  field_overrides?: ItemFieldOverrides;
  additional_labels?: InstructionLabel[];
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
    ...(v.field_overrides
      ? { field_overrides: normalizeFieldOverrides(v.field_overrides) }
      : {}),
    ...(v.additional_labels
      ? { additional_labels: normalizeInstructionLabels(v.additional_labels) }
      : {}),
  };
}
function normalizeFieldOverrides(value: unknown): ItemFieldOverrides {
  const v = recordValue(value),
    result: ItemFieldOverrides = {};
  for (const key of ["front_mark", "side_mark", "small_label"] as const) {
    if (!(key in v)) continue;
    const f = recordValue(v[key]);
    result[key] = {
      mode: f.mode === "override" || f.mode === "none" ? f.mode : "inherit",
      ...(f.mark ? { mark: mark(f.mark) } : {}),
    };
  }
  if ("labeling_requirements" in v) {
    const f = recordValue(v.labeling_requirements);
    result.labeling_requirements = {
      mode:
        f.mode === "append" || f.mode === "replace" || f.mode === "none"
          ? f.mode
          : "inherit",
      text: text(f.text),
    };
  }
  return result;
}
const combine = (...values: string[]) =>
  values.filter((v) => v.trim()).join("\n");
export function resolveProductionItemMarking(
  productionMarking: unknown,
  itemOverride: unknown,
) {
  const common = normalizeProductionInstructions(productionMarking),
    own = normalizeItemMarkingOverride(itemOverride);
  const none = (): Mark => ({ mode: "none", text: "", image_asset: null });
  const fields = own.field_overrides || {};
  const resolvedMark = (
    key: "front_mark" | "side_mark" | "small_label",
    legacy: Mark,
  ): Mark => {
    const f = fields[key];
    if (!f) return legacy;
    if (f.mode === "inherit") return common[key];
    if (f.mode === "none") return none();
    return f.mark || none();
  };
  const smallLabel = resolvedMark(
    "small_label",
    own.mode === "replace" ? none() : common.small_label,
  );
  const additionalLabels = [
    ...(own.mode === "replace"
      ? own.labels
      : own.mode === "append"
        ? [...common.additional_labels, ...own.labels]
        : common.additional_labels),
    ...(own.additional_labels || []),
  ].filter((l) => l.mode !== "none");
  const labels: InstructionLabel[] = [
    { ...smallLabel, id: "common-small-label", type: "common" },
    ...additionalLabels,
  ].filter((l) => l.mode !== "none");
  const placement = fields.labeling_requirements;
  const legacyPlacement =
    own.mode === "replace"
      ? own.labeling_requirements
      : own.mode === "append"
        ? combine(common.labeling_requirements, own.labeling_requirements)
        : common.labeling_requirements;
  return {
    frontMark: resolvedMark(
      "front_mark",
      own.mode === "replace" ? own.front_mark : common.front_mark,
    ),
    sideMark: resolvedMark(
      "side_mark",
      own.mode === "replace" ? own.side_mark : common.side_mark,
    ),
    smallLabel,
    additionalLabels,
    labels,
    labelingRequirements: !placement
      ? legacyPlacement
      : placement.mode === "inherit"
        ? common.labeling_requirements
        : placement.mode === "none"
          ? ""
          : placement.mode === "replace"
            ? placement.text || ""
            : combine(common.labeling_requirements, placement.text || ""),
    productionRequirements: common.production_requirements,
    notes:
      own.mode === "replace"
        ? own.notes
        : own.mode === "append" || own.field_overrides
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
export const ITEM_XLSX_WARNING =
  "附加标签、产品级贴标要求及内部备注仅保存在 CRM，未输出到 Production XLSX";
export const ITEM_MARK_XLSX_WARNING =
  "产品级正/侧唛当前未单独输出到 Production XLSX";
export function hasItemMarkOverride(value: unknown) {
  const own = normalizeItemMarkingOverride(value);
  return (
    own.mode === "replace" ||
    [own.field_overrides?.front_mark, own.field_overrides?.side_mark].some(
      (f) => f && f.mode !== "inherit",
    )
  );
}
export function validateItemMarkingImages(value: unknown) {
  const own = normalizeItemMarkingOverride(value);
  const marks = [
    ...(own.mode !== "inherit" ? own.labels : []),
    ...(own.additional_labels || []),
  ];
  if (own.mode === "replace")
    marks.push(
      { ...own.front_mark, id: "front", type: "mark" },
      { ...own.side_mark, id: "side", type: "mark" },
    );
  for (const f of Object.values(own.field_overrides || {})) {
    if (f.mode === "override" && "mark" in f && f.mark)
      marks.push({ ...f.mark, id: "field", type: "mark" });
  }
  if (marks.some((m) => m.mode === "image" && !m.image_asset))
    throw new Error("图片标签需要上传图片。");
}
