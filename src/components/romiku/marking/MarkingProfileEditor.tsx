import { useState } from "react";
import { useDataProvider, useRefresh, type RaRecord } from "ra-core";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  customerMarkingProfile,
  markingKeys,
  normalizeMarkingProfile,
  type Mark,
} from "./markingProfile";
import { markingLabels, uploadMarkingImage } from "./markingAssets";

import { MarkingPreview } from "./MarkingPreview";
import {
  InstructionLabelsEditor,
  InstructionUploadContext,
  validateLabels,
} from "./InstructionLabelsEditor";
import {
  normalizeProductionInstructions,
  ITEM_XLSX_WARNING,
} from "./productionInstructions";
import { reloadProductionDefaults } from "./instructionWorkflow";
type EditorProps = {
  kind: "customer" | "production" | "order";
  record: RaRecord;
};
export function MarkingProfileEditor(props: EditorProps) {
  return (
    <MarkingProfileEditorForm
      key={`${props.kind}:${props.record.id}`}
      {...props}
    />
  );
}
function MarkingProfileEditorForm({
  kind,
  record,
}: {
  kind: "customer" | "production" | "order";
  record: RaRecord;
}) {
  const resource =
    kind === "customer"
      ? "romiku_formal_customers"
      : kind === "order"
        ? "romiku_orders"
        : "romiku_production_orders";
  const field =
    kind === "customer"
      ? "marking_profile"
      : kind === "order"
        ? "production_defaults_snapshot"
        : "marking_snapshot";
  const title =
    kind === "customer"
      ? "包装 / 唛头资料"
      : kind === "order"
        ? "生产要求 / 唛头与标签"
        : "唛头与标签";
  const provider = useDataProvider(),
    refresh = useRefresh(),
    cache = useQueryClient();
  const [profile, setProfile] = useState(() =>
    normalizeProductionInstructions(
      kind === "customer" ? customerMarkingProfile(record) : record[field],
    ),
  );
  const [confirmReload, setConfirmReload] = useState(false),
    [savedProfile, setSavedProfile] = useState(profile),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failure, setFailure] = useState("");
  const update = (key: (typeof markingKeys)[number], patch: Partial<Mark>) =>
    setProfile((current) => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }));
  async function upload(key: (typeof markingKeys)[number], file?: File) {
    if (!file) return;
    setBusy(true);
    setFailure("");
    setMessage("");
    try {
      const image_asset = await uploadMarkingImage(file);
      update(key, { image_asset, mode: "image" });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "图片上传失败。");
    } finally {
      setBusy(false);
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailure("");
    setMessage("");
    try {
      for (const key of markingKeys)
        if (profile[key].mode === "image" && !profile[key].image_asset)
          throw new Error(
            `${markingLabels[key]}选择了图片模式，请上传图片或切换显示方式。`,
          );
      validateLabels(profile.additional_labels);
      const value =
        kind === "customer"
          ? normalizeMarkingProfile(profile)
          : {
              ...profile,
              initialized_at:
                profile.initialized_at || new Date().toISOString(),
              source: profile.initialized_at
                ? profile.source
                : { kind: "manual", id: String(record.id) },
            };
      const { data } = await provider.update(resource, {
        id: record.id,
        data: { [field]: value },
        previousData: record,
      });
      const next = normalizeProductionInstructions(data[field]);
      setSavedProfile(next);
      setProfile(next);
      await cache.invalidateQueries({ queryKey: ["romiku-search"] });
      refresh();
      setMessage(`${title}已保存。`);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  const text = (
    key: "labeling_requirements" | "production_requirements" | "notes",
    label: string,
  ) => (
    <label className="block space-y-1">
      {label}
      <textarea
        aria-label={label}
        className="block min-h-24 w-full rounded border p-2"
        value={profile[key]}
        onChange={(e) => setProfile((p) => ({ ...p, [key]: e.target.value }))}
      />
    </label>
  );
  return (
    <InstructionUploadContext.Provider value={setBusy}>
      <details className="rounded border p-4">
        <summary className="cursor-pointer font-medium">{title}</summary>
        {kind !== "customer" && (
          <p className="pt-3 text-sm">
            {profile.initialized_at
              ? `已初始化 · 来源：${profile.source.kind === "order" ? "订单已保存默认值" : profile.source.kind === "customer" ? "创建订单时的客户资料" : profile.source.kind === "legacy_order" ? "历史订单自身资料" : "手动确认"}`
              : "未初始化 · 保存后确认当前内容，主动清空不会自动回填"}
          </p>
        )}
        {kind === "production" && (
          <div className="space-y-2 pt-3">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmReload(true)}
            >
              重新载入订单默认值
            </Button>
            {confirmReload && (
              <div
                role="alertdialog"
                aria-label="确认重新载入订单默认值"
                className="rounded border p-3"
              >
                <p>将覆盖本生产单的统一要求；产品级例外会保留。是否继续？</p>
                <Button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setFailure("");
                    setMessage("");
                    try {
                      const next = normalizeProductionInstructions(
                        await reloadProductionDefaults(String(record.id)),
                      );
                      setProfile(next);
                      setSavedProfile(next);
                      setConfirmReload(false);
                      refresh();
                      setMessage("已重新载入订单默认值，产品级例外已保留。");
                    } catch {
                      setFailure(
                        "无法重新载入订单默认值，请确认来源订单可访问后重试。",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  确认重新载入
                </Button>
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() => setConfirmReload(false)}
                >
                  取消
                </Button>
              </div>
            )}
          </div>
        )}
        <form onSubmit={save} className="space-y-4 pt-4">
          <p className="text-muted-foreground text-sm">
            {kind === "customer"
              ? "仅用于新建订单的默认资料；替换或移除图片不会改变历史订单或生产单。"
              : kind === "order"
                ? "修改仅影响本订单及之后创建的生产单；不会更新已有生产单。"
                : "修改仅影响本生产单；导出使用已保存内容。"}
          </p>
          <fieldset disabled={busy} className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              {markingKeys.map((key) => (
                <section
                  key={key}
                  className="min-w-0 space-y-3 rounded border p-3"
                >
                  <h3 className="font-semibold">{markingLabels[key]}</h3>
                  <label className="block">
                    显示方式
                    <select
                      aria-label={`${markingLabels[key]}显示方式`}
                      className="ml-2 rounded border p-1"
                      value={profile[key].mode}
                      onChange={(e) =>
                        update(key, { mode: e.target.value as Mark["mode"] })
                      }
                    >
                      <option value="image">使用图片</option>
                      <option value="text">使用文字</option>
                      <option value="none">不显示</option>
                    </select>
                  </label>
                  <label className="block">
                    {markingLabels[key]}文字
                    <textarea
                      aria-label={`${markingLabels[key]}文字`}
                      className="block min-h-24 w-full rounded border p-2"
                      value={profile[key].text}
                      onChange={(e) => update(key, { text: e.target.value })}
                    />
                  </label>
                  {profile[key].image_asset && (
                    <>
                      <MarkingPreview
                        asset={profile[key].image_asset!}
                        label={markingLabels[key]}
                      />
                      <p className="break-all text-xs">
                        {profile[key].image_asset!.name}
                      </p>
                    </>
                  )}
                  <label className="block text-sm">
                    {profile[key].image_asset ? "替换" : "上传"}
                    {markingLabels[key]}图片
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      aria-label={`${markingLabels[key]}图片`}
                      className="block w-full"
                      onChange={(e) => {
                        void upload(key, e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {profile[key].image_asset && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        update(key, {
                          image_asset: null,
                          mode:
                            profile[key].mode === "image"
                              ? profile[key].text
                                ? "text"
                                : "none"
                              : profile[key].mode,
                        })
                      }
                    >
                      移除{markingLabels[key]}图片
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      update(key, { mode: "none", text: "", image_asset: null })
                    }
                  >
                    清空{markingLabels[key]}
                  </Button>
                </section>
              ))}
            </div>
            {text("labeling_requirements", "贴标要求")}
            {text(
              "production_requirements",
              kind === "customer"
                ? "默认包装 / 生产备注"
                : "订单要求 / 生产要求",
            )}
            {kind !== "customer" && (
              <>
                <InstructionLabelsEditor
                  labels={profile.additional_labels}
                  onChange={(additional_labels) =>
                    setProfile((p) => ({ ...p, additional_labels }))
                  }
                />
                {text("notes", "内部唛头 / 标签备注")}
                <p className="text-sm text-amber-800">
                  附加标签及内部备注当前仅保存在 CRM。{ITEM_XLSX_WARNING}
                </p>
              </>
            )}
            <div className="flex gap-2">
              <Button type="submit">保存{title}</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setProfile(structuredClone(savedProfile));
                  setFailure("");
                  setMessage("");
                }}
              >
                取消修改
              </Button>
            </div>
          </fieldset>
          {busy && <p role="status">正在处理…</p>}
          {failure && <p role="alert">{failure}</p>}
          {message && <p role="status">{message}</p>}
        </form>
      </details>
    </InstructionUploadContext.Provider>
  );
}
