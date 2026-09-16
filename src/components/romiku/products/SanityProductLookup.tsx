import { useEffect, useRef, useState } from "react";
import type {
  SanityProductSource,
  SanitySkuLookupResult,
} from "./sanityProductSource";

export const SanityProductLookup = ({
  sku,
  source,
  onMatched,
  onCleared,
}: {
  sku: string;
  source: SanityProductSource;
  onMatched: (sanityProductId: string) => void;
  onCleared?: () => void;
}) => {
  const [result, setResult] = useState<
    SanitySkuLookupResult | { status: "loading" }
  >({
    status: "unmatched",
    sku,
  });
  const requestVersion = useRef(0);
  const skuRef = useRef(sku);

  const lookup = async () => {
    const version = ++requestVersion.current;
    const requestedSku = sku;
    setResult({ status: "loading" });
    const next = await source.findBySku(sku);
    if (version !== requestVersion.current || requestedSku !== skuRef.current)
      return;
    setResult(next);
    if (next.status === "matched") onMatched(next.product.sanityProductId);
    else onCleared?.();
  };

  useEffect(() => {
    skuRef.current = sku;
    requestVersion.current += 1;
    setResult({ status: "unmatched", sku });
  }, [sku]);

  return (
    <div className="space-y-2" aria-live="polite">
      <button
        type="button"
        className="rounded-md border px-3 py-2 text-sm"
        disabled={!sku.trim() || result.status === "loading"}
        onClick={() => void lookup()}
      >
        Look up SKU
      </button>
      {result.status === "loading" && <p>Looking up SKU in Sanity…</p>}
      {result.status === "matched" && (
        <p>
          {result.product.title ?? "Matched product"} ({result.product.sku})
        </p>
      )}
      {result.status === "unmatched" && (
        <p>No Sanity product matched this SKU.</p>
      )}
      {result.status === "error" && <p>{result.message}</p>}
    </div>
  );
};
