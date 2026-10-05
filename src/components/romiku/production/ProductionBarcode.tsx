import { useState } from "react";
import type { RaRecord } from "ra-core";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import { validateBarcode, previewBarcodePaste } from "./barcode";
export const BARCODE_NOTE =
  "自动生成的号码符合 EAN-13 校验规则，但不是 GS1 官方分配号码。正式零售 GTIN 请使用客户 / 品牌提供的号码。";
export function ProductionBarcode({
  line,
  onChange,
}: {
  line: RaRecord;
  onChange: (value: string | null) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<{
      kind: string;
      candidates: string[];
    } | null>(null);
  const check = validateBarcode(line.barcode_number);
  async function generate() {
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const { data, error } = await getSupabaseClient().rpc(
        "romiku_production_barcode",
        {
          source_item_id: line.source_order_item_id,
          generate_number: true,
          production_item_id: line.isNew ? null : line.id,
        },
      );
      if (error || !data?.ok || !Array.isArray(data.candidates))
        throw new Error(data?.message || "无法读取或生成条形码，请重试。");
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法生成条形码。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-w-56 space-y-2">
      <input
        aria-label={`条形码 ${line.sku}`}
        className="w-full rounded border p-2 font-mono"
        type="text"
        inputMode="numeric"
        value={line.barcode_number || ""}
        placeholder="留空表示不使用"
        onChange={(e) => {
          setPreview(null);
          onChange(e.target.value);
        }}
      />
      {!check.ok && (
        <p role="alert" className="text-red-700 text-xs">
          {check.message}
          {check.suggestion && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onChange(check.suggestion!)}
            >
              确认使用 {check.suggestion}
            </Button>
          )}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void generate()}
        >
          自动生成 / 沿用
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            onChange(null);
            setPreview(null);
          }}
        >
          不使用
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      {preview && (
        <section
          className="rounded border p-2 space-y-2"
          aria-label={`条形码预览 ${line.sku}`}
        >
          <p>
            {preview.kind === "reuse"
              ? `该订单中的 ${line.sku} 已保存或预留以下条形码，是否沿用？`
              : "已预留号码；确认后加入草稿，整单保存后生效。"}
          </p>
          {preview.candidates.map((value) => (
            <Button
              key={value}
              variant="outline"
              onClick={() => {
                onChange(value);
                setPreview(null);
              }}
            >
              确认使用 {value}
            </Button>
          ))}
          <Button variant="ghost" onClick={() => setPreview(null)}>
            取消条码预览
          </Button>
        </section>
      )}
    </div>
  );
}
export function BarcodePaste({
  items,
  onApply,
}: {
  items: RaRecord[];
  onApply: (values: { id: string | number; barcode: string | null }[]) => void;
}) {
  const [text, setText] = useState(""),
    [preview, setPreview] = useState<ReturnType<
      typeof previewBarcodePaste
    > | null>(null);
  return (
    <details className="rounded border p-3">
      <summary>批量填写条形码</summary>
      <p>
        粘贴两列：SKU、条形码。空白条码将清空该产品号码。确认映射后加入草稿，点击整单“保存”一次提交。
      </p>
      <textarea
        className="w-full rounded border p-2"
        aria-label="批量条形码"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(null);
        }}
      />
      <Button
        variant="outline"
        onClick={() => setPreview(previewBarcodePaste(text, items))}
      >
        预览条形码映射
      </Button>
      {preview && (
        <div>
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>条形码</th>
                <th>核对</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i}>
                  <td>{row.sku}</td>
                  <td>{row.barcode || "清空"}</td>
                  <td>{row.error || "匹配成功"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button
            disabled={!preview.length || preview.some((r) => !!r.error)}
            onClick={() => {
              onApply(preview.map((r) => ({ id: r.id!, barcode: r.barcode })));
              setPreview(null);
              setText("");
            }}
          >
            确认应用条形码到草稿
          </Button>
        </div>
      )}
    </details>
  );
}
