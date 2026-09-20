import { useEffect, useState, type Ref } from "react";
import type { SanityCatalogProduct } from "../products/sanityCatalogSource";
import { createSanityCatalogSource } from "../products/sanityCatalogSource";
import { loadWebsiteProductImages } from "../products/websiteProductImages";

export type ProductSpecificationMode = "all" | "machines-only" | "none";

export function shouldImportProductSpecifications(
  kind: "quote" | "pi" | "order",
  product: SanityCatalogProduct,
) {
  if (kind !== "quote") return false;
  const category = [
    product.category?._id,
    product.category?.title?.zh,
    product.category?.title?.en,
    product.category?.title?.es,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /machine|设备|机器/.test(category);
}

export function createItemSnapshot(
  product: SanityCatalogProduct,
  resolvedImageUrl?: string,
  options: { includeSpecification?: boolean } = {},
) {
  const specification = (product.parameters ?? [])
    .map((parameter) => {
      const label =
        parameter.label?.zh ?? parameter.label?.en ?? parameter.label?.es;
      return label && parameter.value != null
        ? `${label}: ${String(parameter.value)}`
        : "";
    })
    .filter(Boolean)
    .join("；");
  return {
    sanity_product_id: product.id,
    sku: product.sku ?? "",
    product_snapshot: {
      name:
        product.name?.zh ??
        product.name?.en ??
        product.name?.es ??
        product.sku ??
        "",
      image_url: resolvedImageUrl ?? null,
      moq: product.moqQuantity ?? null,
      ...(options.includeSpecification === false ? {} : { specification }),
    },
    packing_snapshot: {
      description:
        product.packaging?.zh ??
        product.packaging?.en ??
        product.packaging?.es ??
        "",
      qty_per_carton:
        product.cartonQty == null ? null : Number(product.cartonQty),
    },
  };
}

export function ProductLibraryLookup({
  sku = "",
  onSelected,
  onManualSku,
  inputRef,
  specificationMode = "all",
}: {
  sku?: string;
  onSelected: (snapshot: ReturnType<typeof createItemSnapshot>) => void;
  onManualSku: (sku: string) => void;
  inputRef?: Ref<HTMLInputElement>;
  specificationMode?: ProductSpecificationMode;
}) {
  const [search, setSearch] = useState(sku);
  const [products, setProducts] = useState<SanityCatalogProduct[]>([]);
  const [images, setImages] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!search.trim()) {
      setProducts([]);
      return;
    }
    setLoading(true);
    createSanityCatalogSource()
      .getPage({ search, includeUnpublished: false })
      .then(async (page) => {
        const urls = await loadWebsiteProductImages(page.products).catch(
          () => new Map<string, string>(),
        );
        if (!cancelled) {
          setProducts(page.products);
          setImages(urls);
        }
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search]);
  return (
    <div className="relative min-w-48">
      <input
        aria-label="搜索 SKU 或产品"
        ref={inputRef}
        className="w-full rounded border p-1"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        onBlur={() => {
          const next = search.trim();
          if (next && next !== sku) onManualSku(next);
        }}
        placeholder="SKU / 产品名称"
      />
      {(loading || products.length > 0) && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded border bg-background shadow">
          {loading && <li className="p-2">正在搜索产品…</li>}
          {products.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 p-2 text-left hover:bg-muted"
                onClick={() => {
                  onSelected(
                    createItemSnapshot(product, images.get(product.id), {
                      includeSpecification:
                        specificationMode === "all" ||
                        (specificationMode === "machines-only" &&
                          shouldImportProductSpecifications("quote", product)),
                    }),
                  );
                  setSearch(product.sku ?? "");
                  setProducts([]);
                }}
              >
                {images.get(product.id) ? (
                  <img
                    className="h-8 w-8 object-cover"
                    src={images.get(product.id)}
                    alt=""
                  />
                ) : (
                  <span className="h-8 w-8">—</span>
                )}
                <span>
                  <strong>{product.sku}</strong> ·{" "}
                  {product.name?.zh ?? product.name?.en ?? "未命名产品"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
