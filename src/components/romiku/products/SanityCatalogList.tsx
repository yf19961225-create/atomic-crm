import { useEffect, useState } from "react";
import { createSanityCatalogSource, type SanityCatalogProduct } from "./sanityCatalogSource";

export const SanityCatalogList = () => {
  const [products, setProducts] = useState<SanityCatalogProduct[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => { createSanityCatalogSource().getPage({ search: "", includeUnpublished: false }).then((page) => setProducts(page.products)).catch(() => setError(true)); }, []);
  if (error) return <p role="alert">产品目录暂时无法加载。</p>;
  if (!products.length) return <p>正在加载产品目录…</p>;
  return <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>图片</th><th>SKU</th><th>中文名称</th><th>英文名称</th><th>分类</th><th>MOQ</th><th>包装</th><th>Carton Qty</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td>{product.images?.[0]?.url ? <img src={product.images[0].url} alt="" className="h-10 w-10 object-cover" /> : "—"}</td><td>{product.sku ?? "—"}</td><td>{product.name?.zh ?? product.name?.en ?? "未命名产品"}</td><td>{product.name?.en ?? "—"}</td><td>{product.category?.title?.zh ?? product.category?.title?.en ?? "—"}</td><td>{product.moqQuantity ?? "—"} {product.moqUnit?.zh ?? product.moqUnit?.en ?? ""}</td><td>{product.packaging?.zh ?? product.packaging?.en ?? "—"}</td><td>{product.cartonQty ?? "—"}</td></tr>)}</tbody></table></div>;
};
