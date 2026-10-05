import {
  MarkEditor,
  InstructionLabelsEditor,
  EffectiveMark,
} from "../marking/InstructionLabelsEditor";
import {
  normalizeItemMarkingOverride,
  resolveProductionItemMarking,
  type ItemMarkingOverride,
  type ProductionInstructions,
  type MarkFieldOverride,
  type TextFieldOverride,
  hasItemMarkOverride,
  ITEM_MARK_XLSX_WARNING,
} from "../marking/productionInstructions";
export function ProductionInstructionsFields({
  value,
  onChange,
}: {
  value: ProductionInstructions;
  onChange: (value: ProductionInstructions) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-3">
        {(["front_mark", "side_mark", "small_label"] as const).map(
          (key, index) => (
            <MarkEditor
              key={key}
              label={["正唛", "侧唛", "统一小标签"][index]}
              value={value[key]}
              onChange={(mark) => onChange({ ...value, [key]: mark })}
            />
          ),
        )}
      </div>
      {(
        [
          ["labeling_requirements", "贴标要求"],
          ["production_requirements", "订单要求"],
          ["notes", "内部备注"],
        ] as const
      ).map(([key, label]) => (
        <label className="block" key={key}>
          {label}
          <textarea
            className="block w-full rounded border p-2"
            aria-label={label}
            value={value[key]}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          />
        </label>
      ))}
      <details>
        <summary>附加统一标签（仅 CRM）</summary>
        <InstructionLabelsEditor
          labels={value.additional_labels}
          onChange={(additional_labels) =>
            onChange({ ...value, additional_labels })
          }
        />
      </details>
    </div>
  );
}
export function SharedInstructionsSummary({
  value,
}: {
  value: ProductionInstructions;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {(["front_mark", "side_mark", "small_label"] as const).map((key) => (
        <EffectiveMark
          key={key}
          label={
            {
              front_mark: "正唛",
              side_mark: "侧唛",
              small_label: "统一小标签",
            }[key]
          }
          mark={value[key]}
        />
      ))}
      {
        <p className="whitespace-pre-wrap">
          贴标要求：{value.labeling_requirements || "无"}
        </p>
      }
      {
        <p className="whitespace-pre-wrap">
          订单要求：{value.production_requirements || "无"}
        </p>
      }
      {value.notes && (
        <p className="whitespace-pre-wrap">内部备注：{value.notes}</p>
      )}
      {value.additional_labels.map((label) => (
        <EffectiveMark key={label.id} label="附加统一标签" mark={label} />
      ))}
      {value.additional_labels.length === 0 && <p>附加统一标签：无</p>}
    </div>
  );
}
export function ItemOverrideFields({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (v: ItemMarkingOverride) => void;
}) {
  const own = normalizeItemMarkingOverride(value),
    fields = own.field_overrides || {};
  const setMark = (
    key: "front_mark" | "side_mark" | "small_label",
    field: MarkFieldOverride,
  ) => onChange({ ...own, field_overrides: { ...fields, [key]: field } });
  const placement = fields.labeling_requirements;
  return (
    <div className="space-y-4">
      <p>只设置本产品与统一要求不同的内容；未修改的字段保留原有设置。</p>
      <div className="grid gap-3 lg:grid-cols-3">
        {(["front_mark", "side_mark", "small_label"] as const).map((key) => {
          const label = {
              front_mark: "产品正唛",
              side_mark: "产品侧唛",
              small_label: "产品小标签",
            }[key],
            field = fields[key];
          return (
            <section key={key} className="space-y-2 rounded border p-3">
              <label>
                {label}
                <select
                  className="block w-full rounded border p-2"
                  aria-label={`${label}适用方式`}
                  value={
                    field?.mode ||
                    (own.mode === "inherit" ? "inherit" : "legacy")
                  }
                  onChange={(e) =>
                    setMark(key, {
                      mode: e.target.value as MarkFieldOverride["mode"],
                      ...(e.target.value === "override"
                        ? {
                            mark: field?.mark || {
                              mode: "text",
                              text: "",
                              image_asset: null,
                            },
                          }
                        : {}),
                    })
                  }
                >
                  {!field && own.mode !== "inherit" && (
                    <option value="legacy">沿用已保存的历史设置</option>
                  )}
                  <option value="inherit">使用统一要求</option>
                  <option value="override">
                    {key === "small_label"
                      ? "使用产品独立小标签"
                      : "使用产品独立内容"}
                  </option>
                  <option value="none">不需要</option>
                </select>
              </label>
              {field?.mode === "override" && (
                <MarkEditor
                  label={label}
                  allowNone={false}
                  value={
                    field.mark || { mode: "text", text: "", image_asset: null }
                  }
                  onChange={(mark) =>
                    setMark(
                      key,
                      mark.mode === "none"
                        ? { mode: "none" }
                        : { mode: "override", mark },
                    )
                  }
                />
              )}
            </section>
          );
        })}
      </div>
      <label className="block">
        产品贴标要求
        <select
          aria-label="产品贴标要求适用方式"
          className="ml-2 rounded border p-2"
          value={
            placement?.mode || (own.mode === "inherit" ? "inherit" : "legacy")
          }
          onChange={(e) =>
            onChange({
              ...own,
              field_overrides: {
                ...fields,
                labeling_requirements: {
                  mode: e.target.value as TextFieldOverride["mode"],
                  text: placement?.text || "",
                },
              },
            })
          }
        >
          {!placement && own.mode !== "inherit" && (
            <option value="legacy">沿用已保存的历史设置</option>
          )}
          <option value="inherit">使用统一要求</option>
          <option value="append">在统一要求上追加</option>
          <option value="replace">使用产品独立要求</option>
          <option value="none">不需要</option>
        </select>
      </label>
      {(placement?.mode === "append" || placement?.mode === "replace") && (
        <textarea
          className="w-full rounded border p-2"
          aria-label="产品独立贴标要求"
          value={placement.text || ""}
          onChange={(e) =>
            onChange({
              ...own,
              field_overrides: {
                ...fields,
                labeling_requirements: { ...placement, text: e.target.value },
              },
            })
          }
        />
      )}
      {hasItemMarkOverride(own) && (
        <p className="text-sm text-amber-800">{ITEM_MARK_XLSX_WARNING}</p>
      )}
      <details>
        <summary>附加标签与内部备注（仅 CRM）</summary>
        <InstructionLabelsEditor
          labels={own.additional_labels || []}
          onChange={(additional_labels) =>
            onChange({ ...own, field_overrides: fields, additional_labels })
          }
        />
        <label>
          产品内部备注
          <textarea
            className="block w-full rounded border p-2"
            aria-label="产品内部备注"
            value={own.notes}
            onChange={(e) =>
              onChange({
                ...own,
                field_overrides: fields,
                notes: e.target.value,
              })
            }
          />
        </label>
      </details>
      {(own.mode !== "inherit" || own.labels.length > 0) && (
        <details>
          <summary>历史整套设置（保留兼容）</summary>
          <LegacyItemOverrideFields value={own} onChange={onChange} />
        </details>
      )}
    </div>
  );
}

function LegacyItemOverrideFields({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: ItemMarkingOverride) => void;
}) {
  const own = normalizeItemMarkingOverride(value);
  return (
    <div className="space-y-3">
      <label>
        适用方式
        <select
          className="ml-2 rounded border p-2"
          aria-label="产品要求适用方式"
          value={own.mode}
          onChange={(e) =>
            onChange({
              ...own,
              mode: e.target.value as ItemMarkingOverride["mode"],
            })
          }
        >
          <option value="inherit">使用统一要求</option>
          <option value="append">在统一要求上额外增加</option>
          <option value="replace">使用产品独立要求</option>
        </select>
      </label>
      {own.mode !== "inherit" && (
        <>
          {own.mode === "replace" && (
            <div className="grid gap-3 md:grid-cols-2">
              <MarkEditor
                label="产品正唛"
                value={own.front_mark}
                onChange={(front_mark) => onChange({ ...own, front_mark })}
              />
              <MarkEditor
                label="产品侧唛"
                value={own.side_mark}
                onChange={(side_mark) => onChange({ ...own, side_mark })}
              />
            </div>
          )}
          <InstructionLabelsEditor
            labels={own.labels}
            onChange={(labels) => onChange({ ...own, labels })}
          />
          <label className="block">
            产品贴标要求
            <textarea
              className="block w-full rounded border p-2"
              aria-label="产品贴标要求"
              value={own.labeling_requirements}
              onChange={(e) =>
                onChange({ ...own, labeling_requirements: e.target.value })
              }
            />
          </label>
          <label className="block">
            产品标签备注
            <textarea
              className="block w-full rounded border p-2"
              aria-label="产品标签备注"
              value={own.notes}
              onChange={(e) => onChange({ ...own, notes: e.target.value })}
            />
          </label>
        </>
      )}
    </div>
  );
}

export function ResolvedItemInstructions({
  common,
  override,
}: {
  common: unknown;
  override: unknown;
}) {
  const result = resolveProductionItemMarking(common, override),
    own = normalizeItemMarkingOverride(override);
  return (
    <div className="space-y-2">
      <p>
        {Object.values(own.field_overrides || {}).some(
          (f) => f.mode !== "inherit",
        )
          ? "已设置产品特殊要求"
          : own.mode === "inherit"
            ? "使用统一要求"
            : own.mode === "append"
              ? "在统一要求上额外增加"
              : "使用产品独立要求"}
      </p>
      {result.frontMark.mode !== "none" && (
        <EffectiveMark label="最终正唛" mark={result.frontMark} />
      )}
      {result.sideMark.mode !== "none" && (
        <EffectiveMark label="最终侧唛" mark={result.sideMark} />
      )}
      <EffectiveMark label="最终小标签" mark={result.smallLabel} />
      {hasItemMarkOverride(override) && (
        <p className="text-sm text-amber-800">{ITEM_MARK_XLSX_WARNING}</p>
      )}
      {result.additionalLabels.map((mark, index) => (
        <EffectiveMark
          key={`${mark.id}-${index}`}
          label="最终标签"
          mark={mark}
        />
      ))}
      {result.labelingRequirements && (
        <p className="whitespace-pre-wrap">{result.labelingRequirements}</p>
      )}
      {result.notes && <p className="whitespace-pre-wrap">{result.notes}</p>}
    </div>
  );
}
