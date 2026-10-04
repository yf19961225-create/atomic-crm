import { useEffect, useState } from "react";
import type { MarkingAsset } from "./markingProfile";
import { downloadMarkingImage } from "./markingAssets";
export function MarkingPreview({
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
