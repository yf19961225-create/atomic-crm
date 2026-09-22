import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addCostHistory,
  saveInternalNotes,
  saveSupplier,
  type DrawerCost,
  type DrawerExtension,
  type DrawerSupplier,
  type ProductDrawerClient,
  type ProductDrawerReadClient,
  type SupplierOption,
} from "./productDrawerActions";
import type { SanityCatalogProduct } from "./sanityCatalogSource";
import { createSupabaseProductDrawerClient } from "./supabaseProductDrawerClient";

type DrawerClient = ProductDrawerClient & ProductDrawerReadClient;
type Props = {
  product: SanityCatalogProduct | null;
  resolvedImageUrl?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  refreshOverlay: (product: SanityCatalogProduct) => Promise<void>;
  client?: DrawerClient;
};

const defaultClient = createSupabaseProductDrawerClient();

const productText = (value?: Record<string, string>) =>
  value?.zh ?? value?.en ?? value?.es ?? "—";
const fieldValue = (value: unknown) =>
  typeof value === "string" || typeof value === "number"
    ? String(value)
    : value == null
      ? "—"
      : JSON.stringify(value);

export const SanityProductDrawer = ({
  product,
  resolvedImageUrl,
  open,
  onOpenChange,
  refreshOverlay,
  client = defaultClient,
}: Props) => {
  const [extension, setExtension] = useState<DrawerExtension | null>(null);
  const [suppliers, setSuppliers] = useState<DrawerSupplier[]>([]);
  const [costs, setCosts] = useState<DrawerCost[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<SupplierOption[]>([]);
  const [notes, setNotes] = useState("");
  const [selectedSupplier, setSelectedSupplier] =
    useState<DrawerSupplier | null>(null);
  const [message, setMessage] = useState("");
  const [failedImageKey, setFailedImageKey] = useState<string>();
  const imageKey = product ? `${product.id}:${resolvedImageUrl ?? ""}` : "";
  const imageFailed = failedImageKey === imageKey;

  const loadInternal = useCallback(async () => {
    if (!product) return;
    const [nextExtension, nextSuppliers, options] = await Promise.all([
      client.getExtension(product),
      client.getSuppliers(product),
      client.getSupplierOptions(),
    ]);
    setExtension(nextExtension);
    setNotes(nextExtension?.internal_notes ?? "");
    setSuppliers(nextSuppliers);
    setSupplierOptions(options);
    setCosts(
      await client.getCosts(nextSuppliers.map((supplier) => supplier.id)),
    );
  }, [client, product]);

  useEffect(() => {
    if (!open || !product) return;
    setMessage("");
    void loadInternal().catch(() => setMessage("内部采购资料暂时无法加载。"));
  }, [open, product, loadInternal]);

  if (!product) return null;

  const refreshCurrent = async () => {
    await refreshOverlay(product);
    await loadInternal();
  };
  const saveNotes = async () => {
    setMessage("");
    try {
      await saveInternalNotes(
        client,
        product,
        extension?.id,
        notes,
        refreshCurrent,
      );
      setMessage("备注已保存。");
    } catch {
      setMessage("备注保存失败。");
    }
  };
  const submitSupplier = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const supplierId = String(form.get("supplier_id") ?? "");
    if (!supplierId) return setMessage("请选择供应商。");
    setMessage("");
    try {
      await saveSupplier(
        client,
        product,
        {
          id: selectedSupplier?.id,
          supplier_id: supplierId,
          preferred: form.get("preferred") === "on",
          supplier_item_number:
            String(form.get("supplier_item_number") ?? "") || undefined,
          moq: Number(form.get("moq")) || null,
          lead_days: Number(form.get("lead_days")) || null,
          qty_per_carton: Number(form.get("qty_per_carton")) || null,
          length_cm: Number(form.get("length_cm")) || null,
          width_cm: Number(form.get("width_cm")) || null,
          height_cm: Number(form.get("height_cm")) || null,
          carton_weight_kg: Number(form.get("carton_weight_kg")) || null,
        },
        refreshCurrent,
      );
      setSelectedSupplier(null);
      event.currentTarget.reset();
      setMessage("供应商关联已保存。");
    } catch {
      setMessage("供应商关联保存失败。");
    }
  };
  const submitCost = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSupplier) return setMessage("请先选择供应商关联。");
    const form = new FormData(event.currentTarget);
    setMessage("");
    try {
      await addCostHistory(client, selectedSupplier.id, {
        cost: Number(form.get("cost")),
        currency: String(form.get("currency") ?? "USD"),
        effective_date: String(form.get("effective_date")),
        source_type: String(form.get("source_type") ?? "manual"),
      });
      await loadInternal();
      setMessage("参考成本已保存。");
      event.currentTarget.reset();
    } catch {
      setMessage("参考成本保存失败。");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{productText(product.name)}</SheetTitle>
          <SheetDescription>
            Sanity 产品资料只读；内部采购资料保存到 Supabase。
          </SheetDescription>
        </SheetHeader>
        <section className="space-y-3 px-4" aria-label="Sanity 产品资料">
          {resolvedImageUrl && !imageFailed ? (
            <img
              src={resolvedImageUrl}
              alt={`${product.sku ?? "未命名"} 产品图片`}
              className="h-32 w-32 object-cover"
              onError={() => setFailedImageKey(imageKey)}
            />
          ) : (
            <p>暂无产品图片</p>
          )}
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt>SKU</dt>
            <dd>{product.sku ?? "—"}</dd>
            <dt>中文名</dt>
            <dd>{product.name?.zh ?? "—"}</dd>
            <dt>英文名</dt>
            <dd>{product.name?.en ?? "—"}</dd>
            <dt>西语名</dt>
            <dd>{product.name?.es ?? "—"}</dd>
            <dt>分类</dt>
            <dd>{productText(product.category?.title)}</dd>
            <dt>MOQ</dt>
            <dd>
              {product.moqQuantity ?? "—"} {productText(product.moqUnit)}
            </dd>
            <dt>包装</dt>
            <dd>{productText(product.packaging)}</dd>
            <dt>Carton Qty</dt>
            <dd>{product.cartonQty ?? "—"}</dd>
            <dt>发布状态</dt>
            <dd>{product.isPublished ? "已发布" : "未发布"}</dd>
          </dl>
          <div>
            <p className="font-medium">Parameters</p>
            {product.parameters?.length ? (
              <ul>
                {product.parameters.map((parameter, index) => (
                  <li key={index}>
                    {productText(parameter.label)}：
                    {fieldValue(parameter.value)}
                  </li>
                ))}
              </ul>
            ) : (
              <p>—</p>
            )}
          </div>
        </section>
        <section className="space-y-4 border-t p-4" aria-label="内部采购资料">
          <div className="space-y-2">
            <label htmlFor="internal-notes">Internal Notes</label>
            <Textarea
              id="internal-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
            <Button type="button" onClick={saveNotes}>
              保存备注
            </Button>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium">供应商采购信息</h3>
            <p className="text-sm text-muted-foreground">
              每个供应商独立维护 Qty/Ctn、箱规和单箱重量；这些数据仅保存到采购
              overlay。
            </p>
            {suppliers.length ? (
              <ul>
                {suppliers.map((supplier) => (
                  <li
                    key={supplier.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span>
                      {supplier.supplier_name ?? supplier.supplier_id}
                      {supplier.preferred ? "（Preferred Supplier）" : ""} ·
                      Qty/Ctn {supplier.qty_per_carton ?? "—"} · 箱规{" "}
                      {supplier.length_cm != null &&
                      supplier.width_cm != null &&
                      supplier.height_cm != null
                        ? `${supplier.length_cm} × ${supplier.width_cm} × ${supplier.height_cm} cm`
                        : "—"}{" "}
                      · 重量 {supplier.carton_weight_kg ?? "—"} kg · SKU{" "}
                      {supplier.supplier_item_number ?? "—"} · MOQ{" "}
                      {supplier.moq ?? "—"} · Lead Time{" "}
                      {supplier.lead_days ?? "—"} 天
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSelectedSupplier(supplier)}
                    >
                      编辑
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>—</p>
            )}
            <form onSubmit={submitSupplier} className="space-y-2">
              <select
                aria-label="供应商"
                name="supplier_id"
                defaultValue={selectedSupplier?.supplier_id ?? ""}
                key={selectedSupplier?.id ?? "new"}
              >
                <option value="">选择供应商</option>
                {supplierOptions.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
              <Input
                name="supplier_item_number"
                placeholder="Supplier SKU"
                defaultValue={selectedSupplier?.supplier_item_number ?? ""}
                key={`sku-${selectedSupplier?.id ?? "new"}`}
              />
              <Input
                name="moq"
                type="number"
                placeholder="Supplier MOQ"
                defaultValue={selectedSupplier?.moq ?? ""}
                key={`moq-${selectedSupplier?.id ?? "new"}`}
              />
              <Input
                name="lead_days"
                type="number"
                placeholder="Lead Time"
                defaultValue={selectedSupplier?.lead_days ?? ""}
                key={`lead-${selectedSupplier?.id ?? "new"}`}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  name="qty_per_carton"
                  type="number"
                  placeholder="Qty/Ctn"
                  defaultValue={selectedSupplier?.qty_per_carton ?? ""}
                  key={`qty-${selectedSupplier?.id ?? "new"}`}
                />
                <Input
                  name="carton_weight_kg"
                  type="number"
                  step="any"
                  placeholder="单箱重量 kg"
                  defaultValue={selectedSupplier?.carton_weight_kg ?? ""}
                  key={`weight-${selectedSupplier?.id ?? "new"}`}
                />
                <Input
                  name="length_cm"
                  type="number"
                  step="any"
                  placeholder="长 cm"
                  defaultValue={selectedSupplier?.length_cm ?? ""}
                  key={`length-${selectedSupplier?.id ?? "new"}`}
                />
                <Input
                  name="width_cm"
                  type="number"
                  step="any"
                  placeholder="宽 cm"
                  defaultValue={selectedSupplier?.width_cm ?? ""}
                  key={`width-${selectedSupplier?.id ?? "new"}`}
                />
                <Input
                  name="height_cm"
                  type="number"
                  step="any"
                  placeholder="高 cm"
                  defaultValue={selectedSupplier?.height_cm ?? ""}
                  key={`height-${selectedSupplier?.id ?? "new"}`}
                />
              </div>
              <label>
                <input
                  name="preferred"
                  type="checkbox"
                  defaultChecked={selectedSupplier?.preferred ?? false}
                  key={`preferred-${selectedSupplier?.id ?? "new"}`}
                />{" "}
                Preferred Supplier
              </label>
              <Button type="submit">
                {selectedSupplier ? "保存供应商关联" : "新增供应商关联"}
              </Button>
            </form>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium">Reference Cost / Cost History</h3>
            {costs.length ? (
              <ul>
                {costs.map((cost) => (
                  <li key={cost.id}>
                    {cost.currency} {cost.cost} · {cost.effective_date} ·{" "}
                    {cost.source_type}
                  </li>
                ))}
              </ul>
            ) : (
              <p>—</p>
            )}
            <form onSubmit={submitCost} className="space-y-2">
              <p>
                {selectedSupplier
                  ? `当前供应商：${selectedSupplier.supplier_name ?? selectedSupplier.supplier_id}`
                  : "选择上方供应商的编辑以新增成本"}
              </p>
              <Input
                name="cost"
                type="number"
                step="0.01"
                placeholder="Reference Cost"
              />
              <Input
                name="currency"
                defaultValue="USD"
                placeholder="Currency"
              />
              <Input name="effective_date" type="date" />
              <Input
                name="source_type"
                defaultValue="manual"
                placeholder="Source type"
              />
              <Button type="submit">新增参考成本</Button>
            </form>
          </div>
          {message && <p role="status">{message}</p>}
        </section>
      </SheetContent>
    </Sheet>
  );
};
