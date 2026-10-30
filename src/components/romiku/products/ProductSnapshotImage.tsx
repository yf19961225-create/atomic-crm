import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProductCandidateImage } from "./ProductCandidateImage";
import { createSanityCatalogSource } from "./sanityCatalogSource";
import {
  loadWebsiteProductDetails,
  sanityProductImageUrls,
} from "./websiteProductImages";

type Props = { sku?: string | null; imageUrl: unknown; sizeClassName?: string };

// Recovery is display-only. Never persist replacements into historical snapshots.
async function exactCandidates(sku: string, signal: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timeout = setTimeout(abort, 8_000);
  try {
    const [catalog, website] = await Promise.all([
      createSanityCatalogSource()
        .getPage({ search: sku, includeUnpublished: false }, controller.signal)
        .catch(() => undefined),
      loadWebsiteProductDetails(
        [{ id: sku, sku, skuSort: sku, isPublished: true }],
        controller.signal,
      ).catch(() => undefined),
    ]);
    // Normalized search is only discovery. Identity must be exact and unambiguous.
    const matches =
      catalog?.products.filter((product) => product.sku === sku) ?? [];
    const websiteUrl = website?.images.get(sku);
    return {
      candidates: sanityProductImageUrls([
        ...(matches.length === 1 ? (matches[0].images ?? []) : []),
        { url: websiteUrl },
      ]),
      websiteUrl,
    };
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}

function SnapshotImage({ sku, imageUrl, sizeClassName = "h-9 w-9" }: Props) {
  const primary = sanityProductImageUrls([
    { url: typeof imageUrl === "string" ? imageUrl : undefined },
  ])[0];
  const [needsRecovery, setNeedsRecovery] = useState(!primary);
  const exhausted = useCallback(() => setNeedsRecovery(true), []);
  const recovery = useQuery({
    queryKey: ["product-image-recovery", sku],
    enabled: !!sku && needsRecovery,
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    queryFn: ({ signal }) => exactCandidates(sku!, signal),
  });
  return (
    <ProductCandidateImage
      sku={sku ?? ""}
      candidates={sanityProductImageUrls([
        { url: primary },
        ...(recovery.data?.candidates ?? []).map((url) => ({ url })),
      ])}
      websiteUrl={recovery.data?.websiteUrl}
      alt={`${sku || "产品"} 图片`}
      sizeClassName={sizeClassName}
      pending={recovery.isFetching}
      onExhausted={exhausted}
    />
  );
}

export function ProductSnapshotImage(props: Props) {
  return (
    <SnapshotImage
      key={`${props.sku ?? ""}\u0000${String(props.imageUrl ?? "")}`}
      {...props}
    />
  );
}
