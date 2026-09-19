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

export const SanityCatalogList = () => {
  const [products, setProducts] = useState<SanityCatalogProduct[]>([]);
  const [overlay, setOverlay] = useState<Map<string, ProductOverlay>>(
    new Map(),
  );
  const [error, setError] = useState(false);
  const [selectedProduct, setSelectedProduct] =
    useState<SanityCatalogProduct | null>(null);
  useEffect(() => {
    createSanityCatalogSource()
      .getPage({ search: "", includeUnpublished: false })
      .then(async (page) => {
        setProducts(page.products);
        try {
          setOverlay(
            await loadProductProcurementOverlay(
              page.products,
              createSupabaseProcurementOverlayClient(),
            ),
          );
        } catch {
          setOverlay(unavailableOverlay(page.products));
        }
      })
      .catch(() => setError(true));
  }, []);
  if (error) return <p role="alert">产品目录暂时无法加载。</p>;
  if (!products.length) return <p>正在加载产品目录…</p>;
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
  return (
    <div className="overflow-x-auto">
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
            return (
              <tr
                key={product.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => setSelectedProduct(product)}
              >
                <td>
                  {product.images?.[0]?.url ? (
                    <img
                      src={product.images[0].url}
                      alt=""
                      className="h-10 w-10 object-cover"
                    />
                  ) : (
                    "—"
                  )}
                </td>
                <td>{product.sku ?? "—"}</td>
                <td>{product.name?.zh ?? product.name?.en ?? "未命名产品"}</td>
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
                <td>{product.packaging?.zh ?? product.packaging?.en ?? "—"}</td>
                <td>{product.cartonQty ?? "—"}</td>
                <td>
                  {procurement(
                    product,
                    procurementOverlay?.supplierCount || undefined,
                  )}
                </td>
                <td>
                  {procurement(product, procurementOverlay?.preferredSupplier)}
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
      <SanityProductDrawer
        product={selectedProduct}
        open={selectedProduct !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedProduct(null);
        }}
        refreshOverlay={refreshOverlay}
      />
    </div>
  );
};
