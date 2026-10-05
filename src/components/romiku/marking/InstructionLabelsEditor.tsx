import { createContext, useContext, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Mark } from "./markingProfile";
import type { InstructionLabel } from "./productionInstructions";
import { uploadMarkingImage } from "./markingAssets";
import { MarkingPreview } from "./MarkingPreview";
export const InstructionUploadContext = createContext<(busy: boolean) => void>(
  () => {},
);
export function validateLabels(labels: InstructionLabel[]) {
  if (labels.some((l) => l.mode === "image" && !l.image_asset))
    throw new Error("图片标签需要上传图片。");
}
export function MarkEditor({
  value,
  onChange,
  label,
}: {
  value: Mark;
  onChange: (v: Mark) => void;
  label: string;
}) {
  const parentBusy = useContext(InstructionUploadContext);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <fieldset disabled={busy} className="space-y-2 rounded border p-2">
      <legend>{label}</legend>
      <select
        aria-label={`${label}显示方式`}
        value={value.mode}
        onChange={(e) =>
          onChange({ ...value, mode: e.target.value as Mark["mode"] })
        }
      >
        <option value="none">不需要</option>
        <option value="text">使用文字</option>
        <option value="image">使用图片</option>
      </select>
      {value.mode === "text" && (
        <textarea
          className="block w-full rounded border p-2"
          aria-label={`${label}文字`}
          value={value.text}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
        />
      )}
      {value.mode === "image" && (
        <>
          {value.image_asset && (
            <MarkingPreview asset={value.image_asset} label={label} />
          )}
          <label className="block">
            {value.image_asset ? "替换图片" : "上传图片"}
            <input
              aria-label={`${label}图片`}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setBusy(true);
                parentBusy(true);
                setError("");
                try {
                  onChange({
                    ...value,
                    image_asset: await uploadMarkingImage(file),
                  });
                } catch {
                  setError("图片上传失败，请重试。");
                } finally {
                  setBusy(false);
                  parentBusy(false);
                }
              }}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onChange({ ...value, image_asset: null, mode: "none" })
            }
          >
            移除图片
          </Button>
        </>
      )}
      {busy && <p role="status">正在上传，请等待上传完成后保存。</p>}
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
export function InstructionLabelsEditor({
  labels,
  onChange,
}: {
  labels: InstructionLabel[];
  onChange: (v: InstructionLabel[]) => void;
}) {
  return (
    <section className="space-y-3">
      <h4 className="font-medium">附加标签</h4>
      {labels.map((l, i) => (
        <div key={l.id} className="space-y-2">
          <label>
            标签类型
            <input
              className="ml-2 rounded border p-1"
              aria-label={`标签 ${i + 1} 类型`}
              value={l.type}
              onChange={(e) =>
                onChange(
                  labels.map((v, j) =>
                    j === i ? { ...v, type: e.target.value } : v,
                  ),
                )
              }
            />
          </label>
          <MarkEditor
            label={`标签 ${i + 1}`}
            value={l}
            onChange={(v) =>
              onChange(
                labels.map((old, j) => (j === i ? { ...old, ...v } : old)),
              )
            }
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => onChange(labels.filter((_, j) => j !== i))}
          >
            移除标签 {i + 1}
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          onChange([
            ...labels,
            {
              id: crypto.randomUUID(),
              type: "custom",
              mode: "text",
              text: "",
              image_asset: null,
            },
          ])
        }
      >
        添加标签
      </Button>
    </section>
  );
}
export function EffectiveMark({ mark, label }: { mark: Mark; label: string }) {
  return (
    <div>
      <strong>{label}：</strong>
      {mark.mode === "image" && mark.image_asset ? (
        <MarkingPreview asset={mark.image_asset} label={label} />
      ) : mark.mode === "text" ? (
        <span className="whitespace-pre-wrap">{mark.text || "（空）"}</span>
      ) : (
        "无"
      )}
    </div>
  );
}
