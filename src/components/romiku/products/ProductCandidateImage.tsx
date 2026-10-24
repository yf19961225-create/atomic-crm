import { useState } from "react";

type Props = {
  sku: string;
  candidates: string[];
  websiteUrl?: string;
  alt: string;
  sizeClassName: string;
  emptyLabel?: string;
  onLoaded?: (url: string) => void;
  onSelect?: (url: string) => void;
};

const reportLoad = (
  sku: string,
  source: "website" | "sanity",
  outcome: "loaded" | "failed",
  elapsedMs: number,
) => {
  if (
    import.meta.env.DEV &&
    import.meta.env.VITE_IMAGE_DIAGNOSTICS === "true"
  ) {
    console.warn("Product image diagnostic", {
      sku,
      source,
      outcome,
      elapsedMs,
    });
  }
};

const CandidateImage = ({
  sku,
  candidates,
  websiteUrl,
  alt,
  sizeClassName,
  emptyLabel = "暂无图片",
  onLoaded,
  onSelect,
}: Props) => {
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const url = candidates[index];
  const source = url === websiteUrl ? "website" : "sanity";
  const content = !url ? (
    <span className="text-xs text-muted-foreground">
      {candidates.length ? "图片加载失败" : emptyLabel}
    </span>
  ) : (
    <span className={`relative inline-block overflow-hidden ${sizeClassName}`}>
      {!loaded && (
        <span className="absolute inset-0 bg-muted" aria-label="图片加载中" />
      )}
      <img
        key={url}
        className={`h-full w-full object-cover ${loaded ? "opacity-100" : "opacity-0"}`}
        src={url}
        alt={alt}
        onLoad={(event) => {
          if (event.currentTarget.getAttribute("src") !== url) return;
          reportLoad(sku, source, "loaded", Date.now() - startedAt);
          setLoaded(true);
          onLoaded?.(url);
        }}
        onError={(event) => {
          if (event.currentTarget.getAttribute("src") !== url) return;
          reportLoad(sku, source, "failed", Date.now() - startedAt);
          setLoaded(false);
          setStartedAt(Date.now());
          setIndex((current) => current + 1);
        }}
      />
    </span>
  );

  return onSelect && url ? (
    <button
      type="button"
      aria-label={`预览 ${sku || "产品"} 图片`}
      disabled={!loaded}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(url);
      }}
    >
      {content}
    </button>
  ) : (
    content
  );
};

export const ProductCandidateImage = (props: Props) => (
  <CandidateImage
    key={`${props.sku}\u0000${props.candidates.join("\u0000")}`}
    {...props}
  />
);
