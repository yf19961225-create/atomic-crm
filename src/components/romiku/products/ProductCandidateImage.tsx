import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  sku: string;
  candidates: string[];
  websiteUrl?: string;
  alt: string;
  sizeClassName: string;
  emptyLabel?: string;
  onLoaded?: (url: string) => void;
  onSelect?: (url: string) => void;
  onExhausted?: () => void;
  pending?: boolean;
  timeoutMs?: number;
  sizePx?: number;
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
  onExhausted,
  pending = false,
  timeoutMs = 10_000,
  sizePx,
}: Props) => {
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const failedRef = useRef(failed);
  const [loadedUrl, setLoadedUrl] = useState<string>();
  const candidatesUnique = [...new Set(candidates)];
  const url = candidatesUnique.find((candidate) => !failed.has(candidate));
  const mounted = useRef(true);
  const currentUrl = useRef(url);
  currentUrl.current = url;
  const startedAt = useRef(Date.now());
  const loaded = !!url && loadedUrl === url;
  const source = url === websiteUrl ? "website" : "sanity";
  const fail = useCallback(() => {
    if (
      !mounted.current ||
      !url ||
      currentUrl.current !== url ||
      failedRef.current.has(url)
    )
      return;
    reportLoad(sku, source, "failed", Date.now() - startedAt.current);
    const next = new Set(failedRef.current).add(url);
    failedRef.current = next;
    setFailed(next);
  }, [sku, source, url]);
  useEffect(() => {
    if (!url || loaded) return;
    startedAt.current = Date.now();
    const timer = setTimeout(fail, timeoutMs);
    return () => clearTimeout(timer);
  }, [url, loaded, fail, timeoutMs]);
  useEffect(() => {
    if (!url) onExhausted?.();
  }, [url, onExhausted]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const content = !url ? (
    pending ? (
      <span
        className={`inline-block bg-muted ${sizeClassName}`}
        aria-label="图片加载中"
      />
    ) : (
      <span className="text-xs text-muted-foreground">{emptyLabel}</span>
    )
  ) : (
    <span
      className={`relative inline-block overflow-hidden ${sizeClassName}`}
      style={
        sizePx == null
          ? undefined
          : {
              display: "inline-block",
              flexShrink: 0,
              width: sizePx,
              height: sizePx,
            }
      }
    >
      {!loaded && (
        <span className="absolute inset-0 bg-muted" aria-label="图片加载中" />
      )}
      <img
        key={url}
        className={`h-full w-full object-cover ${loaded ? "opacity-100" : "opacity-0"}`}
        style={{
          width: sizePx ?? "100%",
          height: sizePx ?? "100%",
          objectFit: "cover",
        }}
        src={url}
        alt={alt}
        onLoad={(event) => {
          if (
            !mounted.current ||
            currentUrl.current !== url ||
            failedRef.current.has(url)
          )
            return;
          if (
            event.currentTarget.naturalWidth <= 0 ||
            event.currentTarget.naturalHeight <= 0
          ) {
            fail();
            return;
          }
          reportLoad(sku, source, "loaded", Date.now() - startedAt.current);
          setLoadedUrl(url);
          onLoaded?.(url);
        }}
        onError={fail}
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
  <CandidateImage key={props.sku} {...props} />
);
