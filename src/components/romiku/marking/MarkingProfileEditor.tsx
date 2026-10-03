import { useEffect, useState } from "react";
import { useDataProvider, useRefresh, type RaRecord } from "ra-core";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  customerMarkingProfile,
  markingKeys,
  normalizeMarkingProfile,
  type Mark,
  type MarkingAsset,
  type MarkingProfile,
} from "./markingProfile";
import {
  downloadMarkingImage,
  markingLabels,
  uploadMarkingImage,
} from "./markingAssets";

function MarkingPreview({
  asset,
  label,
}: {
  asset: MarkingAsset;
  label: string;
}) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let disposed = false,
      objectUrl = "";
    setUrl("");
    setError("");
    void downloadMarkingImage(asset)
      .then((blob) => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!disposed) setError("图片预览暂时不可用，请重新打开后重试。");
      });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset.bucket, asset.path]);
  return error ? (
    <p role="alert">{error}</p>
  ) : url ? (
    <img
      src={url}
      alt={`${label}图片预览`}
      className="h-32 max-w-full object-contain"
    />
  ) : (
    <p>正在加载图片…</p>
  );
}
export function MarkingProfileEditor({
  kind,
  record,
}: {
  kind: "customer" | "production";
  record: RaRecord;
}) {
  const resource =
    kind === "customer"
      ? "romiku_formal_customers"
      : "romiku_production_orders";
  const field = kind === "customer" ? "marking_profile" : "marking_snapshot";
  const title = kind === "customer" ? "包装 / 唛头资料" : "唛头与标签";
  const provider = useDataProvider(),
    refresh = useRefresh(),
    cache = useQueryClient();
  const [profile, setProfile] = useState(() =>
    kind === "customer"
      ? customerMarkingProfile(record)
      : normalizeMarkingProfile(record[field]),
  );
  const [savedProfile, setSavedProfile] = useState(profile),
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
      const { data } = await provider.update(resource, {
        id: record.id,
        data: { [field]: profile },
        previousData: record,
      });
      const next = normalizeMarkingProfile(data[field]);
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
    key: "labeling_requirements" | "production_requirements",
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
    <details className="rounded border p-4">
      <summary className="cursor-pointer font-medium">{title}</summary>
      <form onSubmit={save} className="space-y-4 pt-4">
        <p className="text-muted-foreground text-sm">
          {kind === "customer"
            ? "仅用于新建生产单的默认资料；替换或移除图片不会改变历史生产单。"
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
            kind === "customer" ? "默认包装 / 生产备注" : "订单要求 / 生产要求",
          )}
          <div className="flex gap-2">
            <Button type="submit">保存{title}</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setProfile(structuredClone(savedProfile) as MarkingProfile);
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
  );
}
