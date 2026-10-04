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
      {(["front_mark", "side_mark", "small_label"] as const)
        .filter((key) => value[key].mode !== "none")
        .map((key) => (
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
      {value.labeling_requirements && (
        <p className="whitespace-pre-wrap">
          贴标要求：{value.labeling_requirements}
        </p>
      )}
      {value.production_requirements && (
        <p className="whitespace-pre-wrap">
          订单要求：{value.production_requirements}
        </p>
      )}
      {value.notes && (
        <p className="whitespace-pre-wrap">内部备注：{value.notes}</p>
      )}
      {value.additional_labels.map((label) => (
        <EffectiveMark key={label.id} label="附加标签" mark={label} />
      ))}
      {!value.production_requirements &&
        !value.labeling_requirements &&
        !value.notes &&
        value.additional_labels.length === 0 &&
        [value.front_mark, value.side_mark, value.small_label].every(
          (m) => m.mode === "none",
        ) && (
          <p className="text-muted-foreground">
            暂无统一要求；产品默认使用统一要求。
          </p>
        )}
    </div>
  );
}
export function ItemOverrideFields({
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
          <option value="replace">使用该产品独立要求</option>
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
        {own.mode === "inherit"
          ? "使用统一要求"
          : own.mode === "append"
            ? "在统一要求上额外增加"
            : "使用该产品独立要求"}
      </p>
      {result.frontMark.mode !== "none" && (
        <EffectiveMark label="最终正唛" mark={result.frontMark} />
      )}
      {result.sideMark.mode !== "none" && (
        <EffectiveMark label="最终侧唛" mark={result.sideMark} />
      )}
      {result.labels.map((mark, index) => (
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
