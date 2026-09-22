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
  const [supplierForm, setSupplierForm] = useState({
    supplier_id: "",
    supplier_item_number: "",
    moq: "",
    lead_days: "",
    qty_per_carton: "",
    length_cm: "",
    width_cm: "",
    height_cm: "",
    carton_weight_kg: "",
    preferred: false,
  });
  const [supplierDirty, setSupplierDirty] = useState(false);
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
    setSelectedSupplier(null);
    setSupplierForm({
      supplier_id: "",
      supplier_item_number: "",
      moq: "",
      lead_days: "",
      qty_per_carton: "",
      length_cm: "",
      width_cm: "",
      height_cm: "",
      carton_weight_kg: "",
      preferred: false,
    });
    setSupplierDirty(false);
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
    const supplierId = supplierForm.supplier_id;
    if (!supplierId) return setMessage("请选择供应商。");
    setMessage("");
    try {
      await saveSupplier(
        client,
        product,
        {
          id: selectedSupplier?.id,
          supplier_id: supplierId,
          preferred: supplierForm.preferred,
          supplier_item_number: supplierForm.supplier_item_number || undefined,
          moq: Number(supplierForm.moq) || null,
          lead_days: Number(supplierForm.lead_days) || null,
          qty_per_carton: Number(supplierForm.qty_per_carton) || null,
          length_cm: Number(supplierForm.length_cm) || null,
          width_cm: Number(supplierForm.width_cm) || null,
          height_cm: Number(supplierForm.height_cm) || null,
          carton_weight_kg: Number(supplierForm.carton_weight_kg) || null,
        },
        refreshCurrent,
      );
      setSelectedSupplier(null);
      setSupplierForm({
        supplier_id: "",
        supplier_item_number: "",
        moq: "",
        lead_days: "",
        qty_per_carton: "",
        length_cm: "",
        width_cm: "",
        height_cm: "",
        carton_weight_kg: "",
        preferred: false,
      });
      setSupplierDirty(false);
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
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (
          !nextOpen &&
          supplierDirty &&
          !window.confirm("有未保存的采购信息，是否放弃？")
        )
          return;
        if (!nextOpen) setSupplierDirty(false);
        onOpenChange(nextOpen);
      }}
    >
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
                      onClick={() => {
                        setSelectedSupplier(supplier);
                        setSupplierForm({
                          supplier_id: supplier.supplier_id,
                          supplier_item_number:
                            supplier.supplier_item_number ?? "",
                          moq: supplier.moq == null ? "" : String(supplier.moq),
                          lead_days:
                            supplier.lead_days == null
                              ? ""
                              : String(supplier.lead_days),
                          qty_per_carton:
                            supplier.qty_per_carton == null
                              ? ""
                              : String(supplier.qty_per_carton),
                          length_cm:
                            supplier.length_cm == null
                              ? ""
                              : String(supplier.length_cm),
                          width_cm:
                            supplier.width_cm == null
                              ? ""
                              : String(supplier.width_cm),
                          height_cm:
                            supplier.height_cm == null
                              ? ""
                              : String(supplier.height_cm),
                          carton_weight_kg:
                            supplier.carton_weight_kg == null
                              ? ""
                              : String(supplier.carton_weight_kg),
                          preferred: Boolean(supplier.preferred),
                        });
                        setSupplierDirty(false);
                      }}
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
              <label className="block space-y-1">
                <span>Supplier</span>
                <select
                  aria-label="Supplier"
                  name="supplier_id"
                  value={supplierForm.supplier_id}
                  onChange={(event) => {
                    setSupplierForm((current) => ({
                      ...current,
                      supplier_id: event.target.value,
                    }));
                    setSupplierDirty(true);
                  }}
                >
                  <option value="">选择供应商</option>
                  {supplierOptions.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>
              {[
                [
                  "supplier_item_number",
                  "Supplier SKU",
                  selectedSupplier?.supplier_item_number ?? "",
                ],
                ["moq", "Supplier MOQ", selectedSupplier?.moq ?? ""],
                ["lead_days", "Lead Time", selectedSupplier?.lead_days ?? ""],
              ].map(([name, label]) => (
                <label className="block space-y-1" key={name}>
                  <span>{label}</span>
                  <Input
                    name={String(name)}
                    type={name === "supplier_item_number" ? "text" : "number"}
                    value={
                      supplierForm[name as keyof typeof supplierForm] as string
                    }
                    onChange={(event) => {
                      setSupplierForm((current) => ({
                        ...current,
                        [name]: event.target.value,
                      }));
                      setSupplierDirty(true);
                    }}
                  />
                </label>
              ))}
              <div className="grid grid-cols-2 gap-2">
                {[
                  [
                    "qty_per_carton",
                    "Qty/Ctn",
                    selectedSupplier?.qty_per_carton ?? "",
                  ],
                  ["length_cm", "长(cm)", selectedSupplier?.length_cm ?? ""],
                  ["width_cm", "宽(cm)", selectedSupplier?.width_cm ?? ""],
                  ["height_cm", "高(cm)", selectedSupplier?.height_cm ?? ""],
                  [
                    "carton_weight_kg",
                    "单箱重量(kg)",
                    selectedSupplier?.carton_weight_kg ?? "",
                  ],
                ].map(([name, label]) => (
                  <label className="block space-y-1" key={name}>
                    <span>{label}</span>
                    <Input
                      name={String(name)}
                      type="number"
                      step="any"
                      value={
                        supplierForm[
                          name as keyof typeof supplierForm
                        ] as string
                      }
                      onChange={(event) => {
                        setSupplierForm((current) => ({
                          ...current,
                          [name]: event.target.value,
                        }));
                        setSupplierDirty(true);
                      }}
                    />
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-2">
                <input
                  name="preferred"
                  type="checkbox"
                  checked={supplierForm.preferred}
                  onChange={(event) => {
                    setSupplierForm((current) => ({
                      ...current,
                      preferred: event.target.checked,
                    }));
                    setSupplierDirty(true);
                  }}
                />{" "}
                Preferred Supplier
              </label>
              <Button type="submit">
                {selectedSupplier ? "保存采购信息" : "新增并保存供应商关联"}
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
