import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  loadWebsiteProductImages,
  sanityProductImageUrls,
} from "../products/websiteProductImages";

type Props = { sku?: string | null; imageUrl: unknown };

// Display-only recovery: never replace a saved commercial snapshot.
function ImageForSnapshot({ sku, imageUrl }: Props) {
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [loaded, setLoaded] = useState<string>();
  const primary = sanityProductImageUrls([
    { url: typeof imageUrl === "string" ? imageUrl : undefined },
  ])[0];
  const fallback = useQuery({
    queryKey: ["order-image-fallback", sku],
    enabled: !!sku && (!primary || failed.has(primary)),
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const images = await loadWebsiteProductImages([
        { id: sku!, sku, skuSort: sku!, isPublished: true },
      ]);
      return images.get(sku!) ?? null;
    },
  });
  const url = sanityProductImageUrls([
    { url: primary },
    { url: fallback.data ?? undefined },
  ]).find((candidate) => !failed.has(candidate));
  if (!url) {
    return fallback.isFetching ? (
      <span className="inline-block h-9 w-9 bg-muted" aria-label="图片加载中" />
    ) : (
      <span className="text-xs text-muted-foreground">暂无图片</span>
    );
  }
  return (
    <span className="relative inline-block h-9 w-9 overflow-hidden">
      {loaded !== url && (
        <span className="absolute inset-0 bg-muted" aria-label="图片加载中" />
      )}
      <img
        key={url}
        src={url}
        alt={`${sku || "产品"} 图片`}
        className={`h-full w-full object-cover ${loaded === url ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoaded(url)}
        onError={() => setFailed((previous) => new Set([...previous, url]))}
      />
    </span>
  );
}

export function OrderProductImage(props: Props) {
  return (
    <ImageForSnapshot
      key={`${props.sku ?? ""}\u0000${String(props.imageUrl ?? "")}`}
      {...props}
    />
  );
}
