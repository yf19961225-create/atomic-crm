import type { SanityCatalogProduct } from "./sanityCatalogSource";

export const loadWebsiteProductDetails = async (
  products: SanityCatalogProduct[],
) => {
  const skus = [
    ...new Set(
      products.flatMap((product) => (product.sku ? [product.sku] : [])),
    ),
  ];
  if (!skus.length)
    return {
      images: new Map<string, string>(),
      localizedPowerSupplies: new Map<string, Record<string, string>>(),
    };
  const response = await fetch(
    `/api/product-images?${new URLSearchParams({ skus: skus.join(",") })}`,
  );
  if (!response.ok) throw new Error("website image request failed");
  const body = (await response.json()) as {
    images?: Record<string, string>;
    powerSupplies?: Record<string, Record<string, string>>;
  };
  return {
    images: new Map(
      products.flatMap((product) => {
        const url = product.sku ? body.images?.[product.sku] : undefined;
        return url ? [[product.id, url] as const] : [];
      }),
    ),
    localizedPowerSupplies: new Map(
      products.flatMap((product) => {
        const value = product.sku
          ? body.powerSupplies?.[product.sku]
          : undefined;
        return value ? [[product.id, value] as const] : [];
      }),
    ),
  };
};

export const loadWebsiteProductImages = async (
  products: SanityCatalogProduct[],
) => (await loadWebsiteProductDetails(products)).images;
