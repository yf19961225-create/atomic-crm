import { useEffect, useState } from "react";
import {
  createSanityCatalogSource,
  type SanityCatalogProduct,
} from "./sanityCatalogSource";
import {
  loadProductProcurementOverlay,
  unavailableOverlay,
  type ProductOverlay,
} from "./productProcurementOverlay";
import { createSupabaseProcurementOverlayClient } from "./supabaseProcurementOverlayClient";
import { SanityProductDrawer } from "./SanityProductDrawer";
import { loadWebsiteProductImages } from "./websiteProductImages";

export const catalogColumns = [
  { key: "image", label: "图片", width: "6%" },
  { key: "sku", label: "货号", width: "10%" },
  { key: "qty", label: "装箱数", width: "10%" },
  { key: "dimensions", label: "箱规", width: "15%" },
  { key: "cbm", label: "体积", width: "10%" },
  { key: "weight", label: "重量", width: "10%" },
  { key: "supplier", label: "供应商", width: "17%" },
  { key: "note", label: "产品备注", width: "22%" },
] as const;

export const SanityCatalogList = () => {
  const [products, setProducts] = useState<SanityCatalogProduct[]>([]);
  const [overlay, setOverlay] = useState<Map<string, ProductOverlay>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] =
    useState<SanityCatalogProduct | null>(null);
  const [images, setImages] = useState<Map<string, string>>(new Map()),
    [imagePreview, setImagePreview] = useState<string | null>(null),
    [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    createSanityCatalogSource()
      .getPage({ search, includeUnpublished: false })
      .then(async (page) => {
        if (cancelled) return;
        setProducts(page.products);
        const [nextImages, nextOverlay] = await Promise.all([
          loadWebsiteProductImages(page.products).catch(
            () => new Map<string, string>(),
          ),
          loadProductProcurementOverlay(
            page.products,
            createSupabaseProcurementOverlayClient(),
          ).catch(() => unavailableOverlay(page.products)),
        ]);
        if (!cancelled) {
          setImages(nextImages);
          setFailedImages(new Set());
          setOverlay(nextOverlay);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [search]);
  useEffect(() => {
    if (!imagePreview) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImagePreview(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [imagePreview]);
  const refreshOverlay = async (product: SanityCatalogProduct) => {
    const next = await loadProductProcurementOverlay(
      [product],
      createSupabaseProcurementOverlayClient(),
    );
    setOverlay((current) => {
      const updated = new Map(current);
      const value = next.get(product.id);
      if (value) updated.set(product.id, value);
      return updated;
    });
  };
  if (error) return <p role="alert">产品目录暂时无法加载。</p>;
  if (loading) return <p>正在加载产品目录…</p>;
  const display = (
    item: ProductOverlay | undefined,
    value: string | number | undefined,
  ) => (item?.unavailable ? "暂时无法加载" : (value ?? "—"));
  return (
    <div className="w-full min-w-0 overflow-x-auto">
      <label className="mb-3 block">
        搜索产品{" "}
        <input
          aria-label="搜索产品"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <table className="w-full min-w-0 table-fixed text-sm">
        <caption className="sr-only">产品目录中的产品</caption>
        <colgroup>
          {catalogColumns.map((column) => (
            <col key={column.key} style={{ width: column.width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {catalogColumns.map((column) => (
              <th
                className={`p-2 ${["qty", "dimensions", "cbm", "weight"].includes(column.key) ? "text-right" : "text-left"}`}
                key={column.key}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const item = overlay.get(product.id),
              image = images.get(product.id);
            const hasDimensions =
              item?.lengthCm != null &&
              item?.widthCm != null &&
              item?.heightCm != null;
            const dimensions = hasDimensions
              ? `${item.lengthCm} × ${item.widthCm} × ${item.heightCm} cm`
              : undefined;
            const cbm = hasDimensions
              ? `${((Number(item.lengthCm) * Number(item.widthCm) * Number(item.heightCm)) / 1_000_000).toFixed(3)} m³`
              : undefined;
            const supplier = item?.preferredSupplier
              ? `${item.preferredSupplier}${(item.supplierCount || 0) > 1 ? ` +${item.supplierCount - 1}` : ""}`
              : undefined;
            return (
              <tr
                className="cursor-pointer border-t hover:bg-muted/50"
                key={product.id}
                onClick={() => setSelectedProduct(product)}
              >
                <td className="p-2">
                  {image && !failedImages.has(product.id) ? (
                    <button
                      type="button"
                      aria-label={`预览 ${product.sku || "产品"} 图片`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setImagePreview(image);
                      }}
                    >
                      <img
                        className="h-10 w-10 object-cover"
                        src={image}
                        alt={`${product.sku || "产品"} 图片`}
                        onError={() =>
                          setFailedImages((current) => {
                            const next = new Set(current);
                            next.add(product.id);
                            return next;
                          })
                        }
                      />
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="p-2">{product.sku || "—"}</td>
                <td className="p-2 text-right">
                  {display(item, item?.qtyPerCarton ?? product.cartonQty)}
                </td>
                <td className="p-2 text-right">{display(item, dimensions)}</td>
                <td className="p-2 text-right">{display(item, cbm)}</td>
                <td className="p-2 text-right">
                  {display(
                    item,
                    item?.cartonWeightKg == null
                      ? undefined
                      : `${item.cartonWeightKg} kg`,
                  )}
                </td>
                <td className="p-2">
                  <button
                    type="button"
                    className="text-left underline decoration-dotted underline-offset-2"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedProduct(product);
                    }}
                  >
                    {display(item, supplier)} · 编辑采购信息
                  </button>
                  <span className="sr-only">编辑采购信息</span>
                </td>
                <td className="truncate p-2">
                  {display(item, item?.internalNotes || undefined)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!products.length && <p>没有找到匹配产品。</p>}
      <SanityProductDrawer
        product={selectedProduct}
        resolvedImageUrl={
          selectedProduct ? images.get(selectedProduct.id) : undefined
        }
        open={selectedProduct !== null}
        onOpenChange={(open) => !open && setSelectedProduct(null)}
        refreshOverlay={refreshOverlay}
      />
      {imagePreview && (
        <div
          role="dialog"
          aria-label="产品图片预览"
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6"
          onClick={() => setImagePreview(null)}
        >
          <img
            className="max-h-full max-w-full"
            src={imagePreview}
            alt="产品大图"
          />
        </div>
      )}
    </div>
  );
};
