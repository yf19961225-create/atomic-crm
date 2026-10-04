import { useState } from "react";
import type { RaRecord } from "ra-core";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  InstructionLabelsEditor,
  InstructionUploadContext,
  MarkEditor,
  EffectiveMark,
  validateLabels,
} from "./InstructionLabelsEditor";
import {
  normalizeItemMarkingOverride,
  resolveProductionItemMarking,
  ITEM_XLSX_WARNING,
  type InstructionLabel,
} from "./productionInstructions";
import { updateItemMarking } from "./instructionWorkflow";
export function ItemMarkingResult({
  common,
  override,
}: {
  common: unknown;
  override: unknown;
}) {
  const result = resolveProductionItemMarking(common, override);
  return (
    <div className="space-y-2 rounded bg-muted p-3">
      <h4 className="font-medium">
        最终有效结果 · {normalizeItemMarkingOverride(override).mode}
      </h4>
      <EffectiveMark label="正唛" mark={result.frontMark} />
      <EffectiveMark label="侧唛" mark={result.sideMark} />
      <div>
        标签：{!result.labels.length && "无"}
        {result.labels.map((l, i) => (
          <EffectiveMark key={`${l.id}-${i}`} label={l.type} mark={l} />
        ))}
      </div>
      <p className="whitespace-pre-wrap">
        贴标要求：{result.labelingRequirements || "无"}
      </p>
      <p className="whitespace-pre-wrap">备注：{result.notes || "无"}</p>
    </div>
  );
}
export function ProductionItemMarking({
  parent,
  items,
  onChanged,
}: {
  parent: RaRecord;
  items: RaRecord[];
  onChanged: () => Promise<unknown>;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [editing, setEditing] = useState<RaRecord | null>(null),
    [value, setValue] = useState(() => normalizeItemMarkingOverride(null)),
    [bulk, setBulk] = useState<"add" | "reset" | null>(null),
    [labels, setLabels] = useState<InstructionLabel[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const cache = useQueryClient();
  async function save(action: "set" | "add" | "reset") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (action === "set" && value.mode !== "inherit") {
        validateLabels(value.labels);
        if (value.mode === "replace")
          validateLabels([
            { ...value.front_mark, id: "front", type: "front" },
            { ...value.side_mark, id: "side", type: "side" },
          ]);
      }
      if (action === "add") {
        validateLabels(labels);
        if (!labels.length) throw new Error("请先添加标签。");
      }
      await updateItemMarking(
        String(parent.id),
        action === "set" ? [String(editing!.id)] : selected,
        action,
        action === "set"
          ? value.mode === "inherit"
            ? { mode: "inherit" }
            : value
          : { labels },
      );
      await onChanged();
      await cache.invalidateQueries({ queryKey: ["romiku-search"] });
      setEditing(null);
      setBulk(null);
      setSelected([]);
      setLabels([]);
      setMessage("产品标签已保存。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <InstructionUploadContext.Provider value={setBusy}>
      <section
        className="space-y-3 rounded border p-4"
        aria-label="产品标签与特殊要求"
      >
        <h3 className="font-semibold">产品标签与特殊要求</h3>
        <p className="text-sm text-amber-800">{ITEM_XLSX_WARNING}</p>
        <fieldset disabled={busy || !!editing || !!bulk} className="space-y-3">
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!items.length}
              onClick={() => {
                setSelected(items.map((i) => String(i.id)));
                setBulk("reset");
                setError("");
              }}
            >
              应用统一要求到全部产品
            </Button>
            <Button
              variant="outline"
              disabled={!selected.length}
              onClick={() => {
                setBulk("reset");
                setError("");
              }}
            >
              恢复所选产品为继承
            </Button>
            <Button
              variant="outline"
              disabled={!selected.length}
              onClick={() => {
                setBulk("add");
                setLabels([]);
                setError("");
              }}
            >
              给所选产品追加标签
            </Button>
          </div>
          {items.map((item) => (
            <div key={item.id} className="rounded border p-3">
              <div className="flex items-center justify-between gap-3">
                <label>
                  <input
                    type="checkbox"
                    aria-label={`选择标签产品 ${item.sku} ${item.position}`}
                    checked={selected.includes(String(item.id))}
                    onChange={(e) =>
                      setSelected((ids) =>
                        e.target.checked
                          ? [...ids, String(item.id)]
                          : ids.filter((id) => id !== String(item.id)),
                      )
                    }
                  />{" "}
                  {item.sku} · {item.product_snapshot?.name}
                </label>
                <details>
                  <summary
                    className="cursor-pointer"
                    aria-label={`${item.sku} 标签操作`}
                  >
                    ⋯
                  </summary>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditing(item);
                      setValue(
                        normalizeItemMarkingOverride(item.marking_override),
                      );
                      setError("");
                      setMessage("");
                    }}
                  >
                    标签 / 特殊要求
                  </Button>
                </details>
              </div>
              <ItemMarkingResult
                common={parent.marking_snapshot}
                override={item.marking_override}
              />
            </div>
          ))}
        </fieldset>
        {editing && (
          <form
            aria-label="编辑产品标签"
            className="space-y-3 rounded border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save("set");
            }}
          >
            <fieldset disabled={busy} className="space-y-3">
              <h4>编辑 {editing.sku} 标签 / 特殊要求</h4>
              <label>
                继承模式
                <select
                  aria-label="标签继承模式"
                  className="ml-2 rounded border"
                  value={value.mode}
                  onChange={(e) =>
                    setValue((v) => ({
                      ...v,
                      mode: e.target.value as typeof v.mode,
                    }))
                  }
                >
                  <option value="inherit">inherit · 使用统一要求</option>
                  <option value="append">append · 保留统一标签并追加</option>
                  <option value="replace">replace · 仅使用本产品要求</option>
                </select>
              </label>
              {value.mode !== "inherit" && (
                <>
                  {value.mode === "replace" && (
                    <>
                      <MarkEditor
                        label="产品正唛"
                        value={value.front_mark}
                        onChange={(front_mark) =>
                          setValue((v) => ({ ...v, front_mark }))
                        }
                      />
                      <MarkEditor
                        label="产品侧唛"
                        value={value.side_mark}
                        onChange={(side_mark) =>
                          setValue((v) => ({ ...v, side_mark }))
                        }
                      />
                    </>
                  )}
                  <InstructionLabelsEditor
                    labels={value.labels}
                    onChange={(labels) => setValue((v) => ({ ...v, labels }))}
                  />
                  <label className="block">
                    产品贴标要求
                    <textarea
                      aria-label="产品贴标要求"
                      className="block w-full rounded border p-2"
                      value={value.labeling_requirements}
                      onChange={(e) =>
                        setValue((v) => ({
                          ...v,
                          labeling_requirements: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="block">
                    产品标签备注
                    <textarea
                      aria-label="产品标签备注"
                      className="block w-full rounded border p-2"
                      value={value.notes}
                      onChange={(e) =>
                        setValue((v) => ({ ...v, notes: e.target.value }))
                      }
                    />
                  </label>
                </>
              )}
              <ItemMarkingResult
                common={parent.marking_snapshot}
                override={value}
              />
              <p>{ITEM_XLSX_WARNING}</p>
              <Button type="submit">保存产品标签</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(null)}
              >
                取消
              </Button>
            </fieldset>
          </form>
        )}
        {bulk && (
          <div
            role="alertdialog"
            aria-label="确认批量修改标签"
            className="space-y-3 rounded border p-3"
          >
            <fieldset disabled={busy} className="space-y-3">
              <p>
                {bulk === "reset"
                  ? "将清除所选产品的全部标签例外并恢复继承。"
                  : "将给所选产品追加标签；replace 产品继续保持 replace。"}{" "}
                共 {selected.length} 项。
              </p>
              {bulk === "add" && (
                <InstructionLabelsEditor labels={labels} onChange={setLabels} />
              )}
              <Button onClick={() => void save(bulk)}>确认批量修改</Button>
              <Button variant="outline" onClick={() => setBulk(null)}>
                取消
              </Button>
            </fieldset>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
      </section>
    </InstructionUploadContext.Provider>
  );
}
