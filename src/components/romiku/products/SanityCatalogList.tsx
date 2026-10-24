import { useEffect, useMemo, useRef, useState, type ComponentProps, type ComponentType } from "react";
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
import {
  catalogThumbnailImageCandidates,
  loadWebsiteProductImages,
} from "./websiteProductImages";
import { ProductCandidateImage } from "./ProductCandidateImage";
import { SearchInput } from "../search/SearchInput";
import { Button } from "@/components/ui/button";
import { BulkSupplierDialog } from "./BulkSupplierDialog";
import { createSupabaseProductDrawerClient } from "./supabaseProductDrawerClient";
import type { SupplierOption } from "./productDrawerActions";
import { createProductSupplierManagementClient } from "./productSupplierManagementClient";
import type { CatalogFilter } from "./sanityCatalogSource";

export const catalogColumns = [
  { key: "select", label: "选择", width: "4%" },
  { key: "image", label: "图片", width: "6%" },
  { key: "sku", label: "货号", width: "10%" },
  { key: "qty", label: "装箱数", width: "10%" },
  { key: "dimensions", label: "箱规", width: "15%" },
  { key: "cbm", label: "体积", width: "10%" },
  { key: "weight", label: "重量", width: "10%" },
  { key: "supplier", label: "供应商", width: "17%" },
  { key: "note", label: "产品备注", width: "18%" },
] as const;

export const SanityCatalogList = ({ catalogSource, overlayLoader = loadProductProcurementOverlay, imageLoader = loadWebsiteProductImages, DrawerComponent = SanityProductDrawer }: {
  catalogSource?: ReturnType<typeof createSanityCatalogSource>;
  overlayLoader?: typeof loadProductProcurementOverlay;
  imageLoader?: typeof loadWebsiteProductImages;
  DrawerComponent?: ComponentType<ComponentProps<typeof SanityProductDrawer>>;
} = {}) => {
  const source = useMemo(() => catalogSource ?? createSanityCatalogSource(), [catalogSource]);
  const [products, setProducts] = useState<SanityCatalogProduct[]>([]);
  const [overlay, setOverlay] = useState<Map<string, ProductOverlay>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [searchInput, setSearchInput] = useState(""),
    [committedSearch, setCommittedSearch] = useState(""),
    [refreshVersion, setRefreshVersion] = useState(0);
  const [selectedProduct, setSelectedProduct] =
    useState<SanityCatalogProduct | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const loadedPageKey = useRef<string | null>(null);
  const [pageCursors, setPageCursors] = useState<Array<CatalogFilter["after"]>>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState<CatalogFilter["after"]>();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [supplierOptions, setSupplierOptions] = useState<SupplierOption[]>([]);
  const [bulkError, setBulkError] = useState("");
  const [images, setImages] = useState<Map<string, string>>(new Map()),
    [imagePreview, setImagePreview] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    source
      .getPage({ search: committedSearch, includeUnpublished: false, after: pageCursors[pageIndex] })
      .then(async (page) => {
        if (cancelled) return;
        const [nextImages, nextOverlay] = await Promise.all([
          imageLoader(page.products).catch(
            () => new Map<string, string>(),
          ),
          overlayLoader(
            page.products,
            createSupabaseProcurementOverlayClient(),
          ).catch(() => unavailableOverlay(page.products)),
        ]);
        if (!cancelled) {
          const pageKey = page.products.map((product) => product.id).join("\u0000");
          if (loadedPageKey.current !== null && loadedPageKey.current !== pageKey) {
            setSelectedIds(new Set());
            setBulkOpen(false);
          }
          loadedPageKey.current = pageKey;
          setProducts(page.products);
          setNextCursor(page.nextCursor);
          setImages(nextImages);
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
  }, [committedSearch, refreshVersion, pageIndex, pageCursors, source, overlayLoader, imageLoader]);
  useEffect(() => {
    if (!imagePreview) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImagePreview(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [imagePreview]);
  const refreshOverlay = async (product: SanityCatalogProduct) => {
    const next = await overlayLoader(
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
  const display = (
    item: ProductOverlay | undefined,
    value: string | number | undefined,
  ) => (item?.unavailable ? "暂时无法加载" : (value ?? "—"));
  const selectedProducts = products.filter((product) => selectedIds.has(product.id));
  const selectPage = (checked: boolean) => setSelectedIds(
    checked ? new Set(products.map((product) => product.id)) : new Set(),
  );
  const openBulk = async () => {
    setBulkError("");
    try {
      setSupplierOptions(await createSupabaseProductDrawerClient().getSupplierOptions());
      setBulkOpen(true);
    } catch {
      setBulkError("供应商列表暂时无法加载。");
    }
  };
  return (
    <div className="w-full min-w-0 overflow-x-auto">
      <SearchInput
        label="搜索产品"
        value={searchInput}
        onChange={setSearchInput}
        onSubmit={(value) => {
          setSelectedIds(new Set());
          setBulkOpen(false);
          setPageCursors([undefined]);
          setPageIndex(0);
          setCommittedSearch(value);
          setRefreshVersion((current) => current + 1);
        }}
        onClear={() => {
          setSelectedIds(new Set());
          setBulkOpen(false);
          setPageCursors([undefined]);
          setPageIndex(0);
          setSearchInput("");
          setCommittedSearch("");
          setRefreshVersion((current) => current + 1);
        }}
        busy={loading}
      />
      {selectedIds.size > 0 && <div role="toolbar" aria-label="批量产品操作" className="flex items-center gap-3 py-2">
        <span>已选择 {selectedIds.size} 个产品</span>
        <Button type="button" onClick={() => void openBulk()}>批量设置供应商</Button>
        <Button type="button" variant="outline" onClick={() => setSelectedIds(new Set())}>清除选择</Button>
      </div>}
      {bulkError && <p role="alert">{bulkError}</p>}
      {loading && <p role="status">正在加载产品目录…</p>}
      {error && (
        <p role="alert">
          {products.length
            ? "产品目录搜索失败，当前显示上次结果。"
            : "产品目录暂时无法加载。"}{" "}
          <button
            type="button"
            onClick={() => setRefreshVersion((current) => current + 1)}
          >
            重试
          </button>
        </p>
      )}
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
                {column.key === "select" ? <label><input type="checkbox" aria-label="全选当前页面" checked={products.length > 0 && products.every((product) => selectedIds.has(product.id))} onChange={(event) => selectPage(event.target.checked)} />{column.label}</label> : column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const item = overlay.get(product.id),
              imageCandidates = catalogThumbnailImageCandidates(
                product,
                images.get(product.id),
              );
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
                <td className="p-2" onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`选择 ${product.sku ?? product.id}`} checked={selectedIds.has(product.id)} onChange={(event) => setSelectedIds((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(product.id); else next.delete(product.id);
                  return next;
                })} /></td>
                <td className="p-2">
                  <ProductCandidateImage
                    sku={product.sku ?? ""}
                    candidates={imageCandidates}
                    websiteUrl={images.get(product.id)}
                    alt={`${product.sku || "产品"} 图片`}
                    sizeClassName="h-10 w-10"
                    onSelect={setImagePreview}
                  />
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
      {!products.length && !loading && !error && <p>没有找到匹配产品。</p>}
      <div className="flex gap-2 py-3">
        <Button type="button" variant="outline" disabled={pageIndex === 0 || loading} onClick={() => { setSelectedIds(new Set()); setBulkOpen(false); setPageIndex((index) => index - 1); }}>上一页</Button>
        <span>第 {pageIndex + 1} 页（仅选择当前页）</span>
        <Button type="button" variant="outline" disabled={!nextCursor || loading} onClick={() => {
          if (!nextCursor) return;
          setSelectedIds(new Set());
          setBulkOpen(false);
          setPageCursors((current) => [...current.slice(0, pageIndex + 1), nextCursor]);
          setPageIndex((index) => index + 1);
        }}>下一页</Button>
      </div>
      <DrawerComponent
        product={selectedProduct}
        imageCandidates={
          selectedProduct
            ? catalogThumbnailImageCandidates(
                selectedProduct,
                images.get(selectedProduct.id),
              )
            : []
        }
        websiteImageUrl={selectedProduct ? images.get(selectedProduct.id) : undefined}
        open={selectedProduct !== null}
        onOpenChange={(open) => !open && setSelectedProduct(null)}
        refreshOverlay={refreshOverlay}
      />
      {bulkOpen && <BulkSupplierDialog
        products={selectedProducts}
        suppliers={supplierOptions}
        client={createProductSupplierManagementClient()}
        onApplied={async () => { setSelectedIds(new Set()); setRefreshVersion((current) => current + 1); }}
        onClose={() => setBulkOpen(false)}
      />}
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
