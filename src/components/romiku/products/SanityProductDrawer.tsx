import { useAppDraft } from "../updates/drafts";
import { useCallback, useEffect, useRef, useState } from "react";
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
  savePackingDefaults,
  saveSupplier,
  type DrawerCost,
  type DrawerExtension,
  type DrawerSupplier,
  type PackingDefaults,
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
  onImageError?: (url: string) => void;
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

const emptySupplierForm = () => ({
  supplier_id: "",
  supplier_item_number: "",
  moq: "",
  lead_days: "",
  preferred: false,
});
const emptyPackingForm = () => ({
  qty_per_carton: "",
  length_cm: "",
  width_cm: "",
  height_cm: "",
  carton_weight_kg: "",
});
const packingFormFrom = (extension: DrawerExtension | null) => ({
  qty_per_carton:
    extension?.qty_per_carton == null ? "" : String(extension.qty_per_carton),
  length_cm: extension?.length_cm == null ? "" : String(extension.length_cm),
  width_cm: extension?.width_cm == null ? "" : String(extension.width_cm),
  height_cm: extension?.height_cm == null ? "" : String(extension.height_cm),
  carton_weight_kg:
    extension?.carton_weight_kg == null
      ? ""
      : String(extension.carton_weight_kg),
});
const numericSnapshot = (form: Record<string, string>) =>
  JSON.stringify(
    Object.values(form).map((value) =>
      value.trim() === "" ? null : Number(value),
    ),
  );
const packingValues = (
  form: ReturnType<typeof emptyPackingForm>,
): PackingDefaults => ({
  qty_per_carton:
    form.qty_per_carton.trim() === "" ? null : Number(form.qty_per_carton),
  length_cm: form.length_cm.trim() === "" ? null : Number(form.length_cm),
  width_cm: form.width_cm.trim() === "" ? null : Number(form.width_cm),
  height_cm: form.height_cm.trim() === "" ? null : Number(form.height_cm),
  carton_weight_kg:
    form.carton_weight_kg.trim() === "" ? null : Number(form.carton_weight_kg),
});

const supplierFormFrom = (supplier: DrawerSupplier | null, supplierId = "") =>
  supplier
    ? {
        supplier_id: supplier.supplier_id,
        supplier_item_number: supplier.supplier_item_number ?? "",
        moq: supplier.moq == null ? "" : String(supplier.moq),
        lead_days: supplier.lead_days == null ? "" : String(supplier.lead_days),
        preferred: Boolean(supplier.preferred),
      }
    : { ...emptySupplierForm(), supplier_id: supplierId };

const supplierSnapshot = (form: ReturnType<typeof emptySupplierForm>) =>
  JSON.stringify(
    Object.entries(form).map(([key, value]) => [
      key,
      typeof value === "string" &&
      !["supplier_id", "supplier_item_number"].includes(key)
        ? Number(value) || null
        : value,
    ]),
  );
const hasInvalidNumericInput = (form: HTMLFormElement) =>
  Array.from(form.elements).some(
    (field) => field instanceof HTMLInputElement && field.validity.badInput,
  );
const costSnapshot = (form: HTMLFormElement) => {
  const values = new FormData(form);
  const cost = String(values.get("cost") ?? "");
  return JSON.stringify([
    cost.trim() === "" ? null : Number(cost),
    String(values.get("currency") ?? "")
      .trim()
      .toUpperCase(),
    String(values.get("effective_date") ?? ""),
    String(values.get("source_type") ?? ""),
    hasInvalidNumericInput(form),
  ]);
};
const emptyCostSnapshot = JSON.stringify([null, "USD", "", "manual", false]);

// A closed drawer owns no editor session, even when its parent stays mounted.
export const SanityProductDrawer = (props: Props) =>
  props.open && props.product ? (
    <ProductDrawerSession key={props.product.id} {...props} />
  ) : null;

const ProductDrawerSession = ({
  product,
  resolvedImageUrl,
  onImageError,
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
  const [supplierForm, setSupplierForm] = useState(emptySupplierForm);
  const [supplierBaseline, setSupplierBaseline] = useState(emptySupplierForm);
  const [supplierInvalid, setSupplierInvalid] = useState(false);
  const [packingForm, setPackingForm] = useState(emptyPackingForm);
  const [packingBaseline, setPackingBaseline] = useState(emptyPackingForm);
  const [packingInvalid, setPackingInvalid] = useState(false);
  const packingDirty =
    packingInvalid ||
    numericSnapshot(packingForm) !== numericSnapshot(packingBaseline);
  const supplierDirty =
    supplierInvalid ||
    supplierSnapshot(supplierForm) !== supplierSnapshot(supplierBaseline);
  const [notesBaseline, setNotesBaseline] = useState("");
  const notesDirty = notes !== notesBaseline;
  const currentDraft = useRef({
    notesDirty,
    supplierDirty,
    packingDirty,
    supplierId: supplierForm.supplier_id,
  });
  currentDraft.current = {
    notesDirty,
    supplierDirty,
    packingDirty,
    supplierId: supplierForm.supplier_id,
  };
  const hydrated = useRef(false);
  const loadVersion = useRef(0);
  const [message, setMessage] = useState("");
  const [failedImageKey, setFailedImageKey] = useState<string>();
  const [costDirty, setCostDirty] = useState(false);
  useAppDraft(
    open && (supplierDirty || costDirty || notesDirty || packingDirty),
  );
  const imageKey = product ? `${product.id}:${resolvedImageUrl ?? ""}` : "";
  const imageFailed = failedImageKey === imageKey;

  const loadInternal = useCallback(
    async (preferredSupplierId?: string) => {
      if (!product) return;
      const version = ++loadVersion.current;
      const [nextExtension, nextSuppliers, options] = await Promise.all([
        client.getExtension(product),
        client.getSuppliers(product),
        client.getSupplierOptions(),
      ]);
      if (version !== loadVersion.current) return;
      setExtension(nextExtension);
      if (!currentDraft.current.packingDirty) {
        const loadedPacking = packingFormFrom(nextExtension);
        setPackingForm(loadedPacking);
        setPackingBaseline(loadedPacking);
      }
      if (!currentDraft.current.notesDirty) {
        setNotes(nextExtension?.internal_notes ?? "");
      }
      if (!hydrated.current || !currentDraft.current.notesDirty) {
        setNotesBaseline(nextExtension?.internal_notes ?? "");
      }
      hydrated.current = true;
      setSuppliers(nextSuppliers);
      setSupplierOptions(options);
      const activeSupplier =
        nextSuppliers.find(
          (supplier) => supplier.supplier_id === preferredSupplierId,
        ) ??
        nextSuppliers.find((supplier) => supplier.preferred) ??
        (nextSuppliers.length === 1 ? nextSuppliers[0] : null);
      if (!currentDraft.current.supplierDirty) {
        setSelectedSupplier(activeSupplier);
        setSupplierForm(supplierFormFrom(activeSupplier));
        setSupplierBaseline(supplierFormFrom(activeSupplier));
      } else {
        // Refresh persisted linkage without replacing an in-progress form.
        const refreshedSupplier = nextSuppliers.find(
          (supplier) =>
            supplier.supplier_id === currentDraft.current.supplierId,
        );
        if (refreshedSupplier) setSelectedSupplier(refreshedSupplier);
      }
      const nextCosts = await client.getCosts(
        nextSuppliers.map((supplier) => supplier.id),
      );
      if (version === loadVersion.current) setCosts(nextCosts);
    },
    [client, product],
  );

  useEffect(() => {
    if (!open || !product) return;
    void loadInternal().catch(() => setMessage("内部采购资料暂时无法加载。"));
    return () => {
      loadVersion.current += 1;
    };
  }, [open, product, loadInternal]);

  if (!product) return null;

  const refreshCurrent = async (preferredSupplierId?: string) => {
    await refreshOverlay(product);
    await loadInternal(preferredSupplierId);
  };
  const saveNotes = async () => {
    setMessage("");
    try {
      await saveInternalNotes(client, product, extension?.id, notes, () =>
        refreshCurrent(),
      );
      setNotesBaseline(notes);
      setMessage("备注已保存。");
    } catch {
      setMessage("备注保存失败。");
    }
  };
  const submitPacking = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitted = packingForm;
    setMessage("");
    try {
      await savePackingDefaults(
        client,
        product,
        extension?.id,
        packingValues(submitted),
        () => refreshCurrent(),
      );
      setPackingBaseline(submitted);
      setPackingInvalid(false);
      setMessage("装箱信息已保存。");
    } catch {
      setMessage("装箱信息保存失败。");
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
        },
        () => refreshCurrent(supplierId),
      );
      setSupplierBaseline(supplierForm);
      setMessage("采购信息已保存。");
    } catch {
      setMessage("供应商关联保存失败。");
    }
  };
  const submitCost = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSupplier) return setMessage("请先选择供应商关联。");
    const formElement = event.currentTarget;
    const submittedSnapshot = costSnapshot(formElement);
    const form = new FormData(formElement);
    setMessage("");
    try {
      await addCostHistory(client, selectedSupplier.id, {
        cost: Number(form.get("cost")),
        currency: String(form.get("currency") ?? "USD"),
        effective_date: String(form.get("effective_date")),
        source_type: String(form.get("source_type") ?? "manual"),
      });
      await loadInternal();
      if (costSnapshot(formElement) === submittedSnapshot) {
        formElement.reset();
        setCostDirty(false);
      }
      setMessage("参考成本已保存。");
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
          (supplierDirty || packingDirty || notesDirty || costDirty) &&
          !window.confirm("有未保存的修改，是否放弃？")
        )
          return;
        onOpenChange(nextOpen);
      }}
    >
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{productText(product.name)}</SheetTitle>
          <SheetDescription>
            产品主数据只读；内部采购资料保存到 CRM。
          </SheetDescription>
        </SheetHeader>
        <section className="space-y-3 px-4" aria-label="产品详情">
          {resolvedImageUrl && !imageFailed ? (
            <img
              src={resolvedImageUrl}
              alt={`${product.sku ?? "未命名"} 产品图片`}
              className="h-32 w-32 object-cover"
              onError={() => {
                setFailedImageKey(imageKey);
                if (resolvedImageUrl) onImageError?.(resolvedImageUrl);
              }}
            />
          ) : (
            <p>暂无产品图片</p>
          )}
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt>货号</dt>
            <dd>{product.sku ?? "—"}</dd>
            <dt>中文名</dt>
            <dd>{product.name?.zh ?? "—"}</dd>
            <dt>英文名</dt>
            <dd>{product.name?.en ?? "—"}</dd>
            <dt>西语名</dt>
            <dd>{product.name?.es ?? "—"}</dd>
            <dt>分类</dt>
            <dd>{productText(product.category?.title)}</dd>
            <dt>起订量</dt>
            <dd>
              {product.moqQuantity ?? "—"} {productText(product.moqUnit)}
            </dd>
            <dt>包装</dt>
            <dd>{productText(product.packaging)}</dd>
            <dt>每箱数量</dt>
            <dd>{product.cartonQty ?? "—"}</dd>
            <dt>发布状态</dt>
            <dd>{product.isPublished ? "已发布" : "未发布"}</dd>
          </dl>
          <div>
            <p className="font-medium">产品参数</p>
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
            <label htmlFor="internal-notes">产品备注</label>
            <Textarea
              id="internal-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
            <Button type="button" onClick={saveNotes}>
              保存备注
            </Button>
          </div>
          <form
            aria-label="产品装箱信息"
            className="space-y-2"
            onInput={(event) =>
              setPackingInvalid(hasInvalidNumericInput(event.currentTarget))
            }
            onSubmit={submitPacking}
          >
            <h3 className="font-medium">产品装箱信息</h3>
            <p className="text-sm text-muted-foreground">
              产品默认装箱数据，不需要供应商。
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["qty_per_carton", "每箱数量"],
                  ["length_cm", "长(cm)"],
                  ["width_cm", "宽(cm)"],
                  ["height_cm", "高(cm)"],
                  ["carton_weight_kg", "单箱重量(kg)"],
                ] as const
              ).map(([name, label]) => (
                <label className="block space-y-1" key={name}>
                  <span>{label}</span>
                  <Input
                    name={name}
                    type="number"
                    step="any"
                    min={name === "qty_per_carton" ? "0.0001" : "0"}
                    value={packingForm[name]}
                    onChange={(event) =>
                      setPackingForm((current) => ({
                        ...current,
                        [name]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Button type="submit">保存装箱信息</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPackingForm(packingBaseline);
                  setPackingInvalid(false);
                }}
              >
                取消/恢复
              </Button>
            </div>
          </form>
          <div className="space-y-2">
            <h3 className="font-medium">供应商采购信息</h3>
            <p className="text-sm text-muted-foreground">
              供应商货号、起订量、交期等信息按供应商独立维护。已有供应商箱规保留为可选覆盖值。
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
                      {supplier.preferred ? "（首选供应商）" : ""} ·
                      供应商覆盖值（可选）：每箱数量{" "}
                      {supplier.qty_per_carton ?? "—"} · 箱规{" "}
                      {supplier.length_cm != null &&
                      supplier.width_cm != null &&
                      supplier.height_cm != null
                        ? `${supplier.length_cm} × ${supplier.width_cm} × ${supplier.height_cm} cm`
                        : "—"}{" "}
                      · 重量 {supplier.carton_weight_kg ?? "—"} kg · 供应商货号{" "}
                      {supplier.supplier_item_number ?? "—"} · 起订量{" "}
                      {supplier.moq ?? "—"} · 交期 {supplier.lead_days ?? "—"}{" "}
                      天
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setSupplierInvalid(false);
                        setSelectedSupplier(supplier);
                        setSupplierForm(supplierFormFrom(supplier));
                        setSupplierBaseline(supplierFormFrom(supplier));
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
            <form
              onInput={(event) =>
                setSupplierInvalid(hasInvalidNumericInput(event.currentTarget))
              }
              onSubmit={submitSupplier}
              className="space-y-2"
            >
              <label className="block space-y-1">
                <span>供应商</span>
                <select
                  aria-label="供应商"
                  name="supplier_id"
                  value={supplierForm.supplier_id}
                  onChange={(event) => {
                    setSupplierInvalid(false);
                    const nextSupplier = suppliers.find(
                      (supplier) => supplier.supplier_id === event.target.value,
                    );
                    setSelectedSupplier(nextSupplier ?? null);
                    setSupplierForm(
                      supplierFormFrom(
                        nextSupplier ?? null,
                        event.target.value,
                      ),
                    );
                    setSupplierBaseline(supplierFormFrom(nextSupplier ?? null));
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
                  "供应商货号",
                  selectedSupplier?.supplier_item_number ?? "",
                ],
                ["moq", "供应商起订量", selectedSupplier?.moq ?? ""],
                ["lead_days", "交期", selectedSupplier?.lead_days ?? ""],
              ].map(([name, label]) => (
                <label className="block space-y-1" key={name}>
                  <span>{label}</span>
                  <Input
                    name={String(name)}
                    type={name === "supplier_item_number" ? "text" : "number"}
                    disabled={!supplierForm.supplier_id}
                    value={
                      supplierForm[name as keyof typeof supplierForm] as string
                    }
                    onChange={(event) => {
                      setSupplierForm((current) => ({
                        ...current,
                        [name]: event.target.value,
                      }));
                    }}
                  />
                </label>
              ))}
              <label className="flex items-center gap-2">
                <input
                  name="preferred"
                  type="checkbox"
                  disabled={!supplierForm.supplier_id}
                  checked={supplierForm.preferred}
                  onChange={(event) => {
                    setSupplierForm((current) => ({
                      ...current,
                      preferred: event.target.checked,
                    }));
                  }}
                />{" "}
                首选供应商
              </label>
              <Button type="submit">
                {selectedSupplier ? "保存采购信息" : "新增并保存供应商关联"}
              </Button>
            </form>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium">参考成本 / 成本历史</h3>
            {costs.length ? (
              <ul>
                {costs.map((cost) => (
                  <li key={cost.id}>
                    {cost.currency} {cost.cost} · {cost.effective_date} ·{" "}
                    {cost.source_type === "manual" ? "手动" : cost.source_type}
                  </li>
                ))}
              </ul>
            ) : (
              <p>—</p>
            )}
            <form
              onInput={(event) =>
                setCostDirty(
                  costSnapshot(event.currentTarget) !== emptyCostSnapshot,
                )
              }
              onReset={() => setCostDirty(false)}
              onSubmit={submitCost}
              className="space-y-2"
            >
              <p>
                {selectedSupplier
                  ? `当前供应商：${selectedSupplier.supplier_name ?? selectedSupplier.supplier_id}`
                  : "选择上方供应商后，可编辑并新增参考成本。"}
              </p>
              <Input
                name="cost"
                type="number"
                step="0.01"
                placeholder="参考成本"
              />
              <Input name="currency" defaultValue="USD" placeholder="币种" />
              <Input name="effective_date" type="date" />
              <Input
                name="source_type"
                defaultValue="manual"
                placeholder="来源类型"
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
