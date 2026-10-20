import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { SanityCatalogProduct } from "./sanityCatalogSource";
import type { SupplierOption } from "./productDrawerActions";
import {
  ProductSupplierActionError,
  type ProductSupplierManagementClient,
} from "./productSupplierManagementClient";

type Plan = Awaited<ReturnType<ProductSupplierManagementClient["previewBulk"]>>;
type Props = {
  products: SanityCatalogProduct[];
  suppliers: SupplierOption[];
  client: ProductSupplierManagementClient;
  onApplied: () => Promise<void>;
  onClose: () => void;
};

export const BulkSupplierDialog = ({ products, suppliers, client, onApplied, onClose }: Props) => {
  const [supplierIds, setSupplierIds] = useState<string[]>([]);
  const [preferredId, setPreferredId] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bulkProducts = products.map((product) => ({
    sku: product.sku ?? "",
    sanity_product_id: product.id,
  }));
  const preview = async () => {
    setBusy(true);
    setError("");
    try {
      setPlan(await client.previewBulk(bulkProducts, supplierIds, preferredId));
    } catch (cause) {
      setPlan(null);
      setError(cause instanceof ProductSupplierActionError ? cause.message : "批量预览失败。");
    } finally {
      setBusy(false);
    }
  };
  const apply = async () => {
    if (!plan?.planToken) return;
    setBusy(true);
    setError("");
    try {
      await client.applyBulk(bulkProducts, supplierIds, preferredId, plan.planToken);
      await onApplied();
      onClose();
    } catch (cause) {
      setPlan(null);
      setError(cause instanceof ProductSupplierActionError && cause.code === "PREVIEW_STALE"
        ? "关联数据已变化，请重新预览后确认。"
        : "批量设置失败，未保存本次操作。请重试。");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div role="dialog" aria-modal="true" aria-label="批量设置供应商" className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded bg-background p-5">
        <h2 className="text-lg font-semibold">批量设置供应商</h2>
        <p>仅针对当前页面已选的 {products.length} 个产品。只新增缺失关联或恢复历史停用关联，不覆盖已有采购资料。</p>
        <fieldset className="space-y-2"><legend>选择供应商（可多选）</legend>
          {suppliers.map((supplier) => <label key={supplier.id} className="flex gap-2"><input type="checkbox" checked={supplierIds.includes(supplier.id)} onChange={(event) => {
            setPlan(null);
            setSupplierIds((current) => event.target.checked ? [...current, supplier.id] : current.filter((id) => id !== supplier.id));
            if (!event.target.checked && preferredId === supplier.id) setPreferredId(null);
          }} />{supplier.name}</label>)}
        </fieldset>
        <label className="block space-y-1"><span>指定首选供应商</span><select aria-label="指定首选供应商" value={preferredId ?? ""} onChange={(event) => { setPlan(null); setPreferredId(event.target.value || null); }}>
          <option value="">不更改现有首选</option>
          {suppliers.filter((supplier) => supplierIds.includes(supplier.id)).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
        </select></label>
        {preferredId && <p className="text-sm">指定首选会取消这些产品原有供应商的首选状态；其他采购信息不变。</p>}
        <Button type="button" disabled={busy || !supplierIds.length} onClick={() => void preview()}>预览批量设置</Button>
        {plan && <section aria-label="批量设置预览" className="space-y-2 rounded border p-3">
          <p>{plan.selectedProductCount ?? products.length} 个产品 × {plan.supplierCount ?? supplierIds.length} 个供应商</p>
          <p>将新增 {plan.newCount ?? 0} 条，恢复 {plan.reactivateCount ?? 0} 条历史关联，已有 {plan.skipCount ?? 0} 条将跳过。</p>
          {!!plan.invalidSkus?.length && <p>无效或重复 SKU：{plan.invalidSkus.map((sku) => sku || "（空）").join("、")}。这些产品将跳过。</p>}
          {!!plan.preferredChangeCount && <p>将调整 {plan.preferredChangeCount} 个产品的首选供应商。</p>}
          <Button type="button" disabled={busy || !plan.planToken} onClick={() => void apply()}>确认批量设置</Button>
        </section>}
        {error && <p role="alert">{error}</p>}
        <Button type="button" variant="outline" onClick={onClose}>取消</Button>
      </div>
    </div>
  );
};
