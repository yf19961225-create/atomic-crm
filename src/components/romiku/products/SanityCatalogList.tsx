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

export const SanityCatalogList = () => {
  const [products, setProducts] = useState<SanityCatalogProduct[]>([]);
  const [overlay, setOverlay] = useState<Map<string, ProductOverlay>>(
    new Map(),
  );
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCursors, setPageCursors] = useState<
    Array<{ skuSort: string; id: string } | undefined>
  >([undefined]);
  const [nextCursor, setNextCursor] = useState<
    { skuSort: string; id: string } | undefined
  >();
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());
  const [websiteImageUrls, setWebsiteImageUrls] = useState<Map<string, string>>(
    new Map(),
  );
  const [selectedProduct, setSelectedProduct] =
    useState<SanityCatalogProduct | null>(null);
  const cursor = pageCursors[pageIndex];
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    createSanityCatalogSource()
      .getPage({
        search,
        includeUnpublished: false,
        ...(cursor ? { after: cursor } : {}),
      })
      .then(async (page) => {
        if (cancelled) return;
        setProducts(page.products);
        setNextCursor(page.nextCursor);
        loadWebsiteProductImages(page.products)
          .then((images) => {
            if (!cancelled) setWebsiteImageUrls(images);
          })
          .catch(() => {
            if (!cancelled) setWebsiteImageUrls(new Map());
          });
        try {
          const nextOverlay = await loadProductProcurementOverlay(
            page.products,
            createSupabaseProcurementOverlayClient(),
          );
          if (!cancelled) setOverlay(nextOverlay);
        } catch {
          if (!cancelled) setOverlay(unavailableOverlay(page.products));
        }
        if (!cancelled) setLoading(false);
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
  }, [cursor, pageIndex, search]);
  if (error) return <p role="alert">产品目录暂时无法加载。</p>;
  if (loading) return <p>正在加载产品目录…</p>;
  const refreshOverlay = async (product: SanityCatalogProduct) => {
    try {
      const next = await loadProductProcurementOverlay(
        [product],
        createSupabaseProcurementOverlayClient(),
      );
      setOverlay((current) => {
        const updated = new Map(current);
        updated.set(product.id, next.get(product.id) ?? { supplierCount: 0 });
        return updated;
      });
    } catch {
      setOverlay((current) => {
        const updated = new Map(current);
        updated.set(product.id, unavailableOverlay([product]).get(product.id)!);
        return updated;
      });
    }
  };
  const procurement = (
    product: SanityCatalogProduct,
    value: string | number | undefined,
  ) => (overlay.get(product.id)?.unavailable ? "暂时无法加载" : (value ?? "—"));
  const updateSearch = (value: string) => {
    setSearch(value);
    setPageCursors([undefined]);
    setPageIndex(0);
    setNextCursor(undefined);
  };
  const nextPage = () => {
    if (!nextCursor) return;
    setPageCursors((current) => [
      ...current.slice(0, pageIndex + 1),
      nextCursor,
    ]);
    setPageIndex((current) => current + 1);
  };
  return (
    <div className="overflow-x-auto">
      <div className="mb-3 flex items-center gap-3">
        <label>
          搜索产品
          <input
            aria-label="搜索产品"
            value={search}
            onChange={(event) => updateSearch(event.target.value)}
          />
        </label>
        <span aria-live="polite">
          第 {pageIndex + 1} 页 · 本页 {products.length} 条
        </span>
        <button
          type="button"
          onClick={() => setPageIndex((current) => current - 1)}
          disabled={pageIndex === 0}
        >
          上一页
        </button>
        <button type="button" onClick={nextPage} disabled={!nextCursor}>
          下一页
        </button>
      </div>
      {!products.length ? (
        <p>没有找到匹配产品。</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>图片</th>
              <th>SKU</th>
              <th>中文名称</th>
              <th>英文名称</th>
              <th>分类</th>
              <th>MOQ</th>
              <th>包装</th>
              <th>Carton Qty</th>
              <th>供应商数</th>
              <th>首选供应商</th>
              <th>Supplier MOQ</th>
              <th>Lead Time</th>
              <th>Reference Cost</th>
              <th>Internal Notes 状态</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const procurementOverlay = overlay.get(product.id);
              const websiteImageUrl = websiteImageUrls.get(product.id);
              return (
                <tr
                  key={product.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedProduct(product)}
                >
                  <td>
                    {websiteImageUrl && !failedImageIds.has(product.id) ? (
                      <img
                        src={websiteImageUrl}
                        alt={`${product.sku ?? "未命名"} 产品图片`}
                        className="h-10 w-10 object-cover"
                        onError={() =>
                          setFailedImageIds((current) => {
                            const next = new Set(current);
                            next.add(product.id);
                            return next;
                          })
                        }
                      />
                    ) : (
                      "暂无产品图片"
                    )}
                  </td>
                  <td>{product.sku ?? "—"}</td>
                  <td>
                    {product.name?.zh ?? product.name?.en ?? "未命名产品"}
                  </td>
                  <td>{product.name?.en ?? "—"}</td>
                  <td>
                    {product.category?.title?.zh ??
                      product.category?.title?.en ??
                      "—"}
                  </td>
                  <td>
                    {product.moqQuantity ?? "—"}{" "}
                    {product.moqUnit?.zh ?? product.moqUnit?.en ?? ""}
                  </td>
                  <td>
                    {product.packaging?.zh ?? product.packaging?.en ?? "—"}
                  </td>
                  <td>{product.cartonQty ?? "—"}</td>
                  <td>
                    {procurement(
                      product,
                      procurementOverlay?.supplierCount || undefined,
                    )}
                  </td>
                  <td>
                    {procurement(
                      product,
                      procurementOverlay?.preferredSupplier,
                    )}
                  </td>
                  <td>
                    {procurement(
                      product,
                      procurementOverlay?.supplierMoq ?? undefined,
                    )}
                  </td>
                  <td>
                    {procurement(
                      product,
                      procurementOverlay?.leadDays == null
                        ? undefined
                        : `${procurementOverlay.leadDays} 天`,
                    )}
                  </td>
                  <td>
                    {procurement(
                      product,
                      procurementOverlay?.referenceCost &&
                        `${procurementOverlay.referenceCost.currency} ${procurementOverlay.referenceCost.cost.toFixed(2)}`,
                    )}
                  </td>
                  <td>
                    {procurement(
                      product,
                      procurementOverlay?.internalNotes ? "有备注" : undefined,
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <SanityProductDrawer
        product={selectedProduct}
        resolvedImageUrl={
          selectedProduct && !failedImageIds.has(selectedProduct.id)
            ? websiteImageUrls.get(selectedProduct.id)
            : undefined
        }
        open={selectedProduct !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedProduct(null);
        }}
        refreshOverlay={refreshOverlay}
      />
    </div>
  );
};
