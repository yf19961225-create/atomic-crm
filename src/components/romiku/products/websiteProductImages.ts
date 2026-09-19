import type { SanityCatalogProduct } from "./sanityCatalogSource";

export const loadWebsiteProductImages = async (
  products: SanityCatalogProduct[],
) => {
  const skus = products.flatMap((product) =>
    product.sku ? [product.sku] : [],
  );
  if (!skus.length) return new Map<string, string>();
  const response = await fetch(
    `/api/product-images?${new URLSearchParams({ skus: skus.join(",") })}`,
  );
  if (!response.ok) throw new Error("website image request failed");
  const body = (await response.json()) as { images?: Record<string, string> };
  return new Map(
    products.flatMap((product) => {
      const url = product.sku ? body.images?.[product.sku] : undefined;
      return url ? [[product.id, url] as const] : [];
    }),
  );
};
