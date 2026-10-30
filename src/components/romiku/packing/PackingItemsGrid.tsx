import { useAppDraft } from "../updates/drafts";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { canonicalSkuSearch } from "../../../../shared/productCatalogQuery";
import { useDataProvider, type RaRecord } from "ra-core";
import { Button } from "@/components/ui/button";
import { ProductSnapshotImage } from "../products/ProductSnapshotImage";
import { ProductLibraryLookup } from "../commercial/ProductLibraryLookup";
import {
  packingQuantity,
  resolvePackingItemDefaults,
  savePackingItem,
} from "./packingWorkflow";

type Row = RaRecord & { [key: string]: unknown };
const editable = [
  "cartons",
  "qty_per_carton",
  "length_cm",
  "width_cm",
  "height_cm",
  "carton_weight_kg",
];
const number = (value: unknown) => Number(value || 0);
type CatalogSnapshot = {
  sanity_product_id?: unknown;
  sku?: unknown;
  product_snapshot?: unknown;
  packing_snapshot?: unknown;
};
export function packingCatalogValues(
  snapshot: CatalogSnapshot,
): Record<string, unknown> {
  const defaults = resolvePackingItemDefaults(
    { quantity: 1, packing_snapshot: snapshot.packing_snapshot },
    1,
  );
  return {
    sanity_product_id: String(snapshot.sanity_product_id || ""),
    sku: String(snapshot.sku || ""),
    product_snapshot: structuredClone(
      (snapshot.product_snapshot as Record<string, unknown>) || {},
    ),
    ...defaults,
  };
}
export const packingColumnKeys = [
  "no",
  "sku",
  "name",
  "image",
  "specification",
  "cartons",
  "qty_per_carton",
  "unit",
  "quantity",
  "length_cm",
  "width_cm",
  "height_cm",
  "per_cbm",
  "carton_weight_kg",
  "total_cbm",
  "total_weight",
  "actions",
] as const;
export const packingColumnWidths = [
  "3%",
  "7%",
  "10%",
  "4%",
  "11%",
  "5%",
  "5%",
  "4%",
  "6%",
  "5%",
  "5%",
  "5%",
  "6%",
  "6%",
  "7%",
  "7%",
  "4%",
] as const;

export function packingComputedValues(item: Row) {
  const perCbm =
    (number(item.length_cm) * number(item.width_cm) * number(item.height_cm)) /
    1_000_000;
  return {
    quantity: packingQuantity(item),
    perCbm: `${perCbm.toFixed(3)} m³`,
    totalCbm: `${(perCbm * number(item.cartons)).toFixed(3)} m³`,
    totalWeight: `${(number(item.carton_weight_kg) * number(item.cartons)).toFixed(2)} kg`,
  };
}

// Only the controls the user can edit and row membership define unsaved work.
function editableSnapshot(rows: Row[]) {
  return JSON.stringify(
    rows.map((row) => [
      String(row.id),
      ...editable.map((key) => number(row[key])),
      String((row.product_snapshot as Row)?.unit ?? ""),
    ]),
  );
}

export function PackingItemsGrid({
  parent,
  items,
  onSaved,
}: {
  parent: RaRecord;
  items: Row[];
  onSaved: () => Promise<unknown>;
}) {
  const provider = useDataProvider();
  const nextProductRef = useRef<HTMLInputElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const rowInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [locateText, setLocateText] = useState("");
  const [locateOpen, setLocateOpen] = useState(false);
  const [locateIndex, setLocateIndex] = useState(0);
  const [draft, setDraft] = useState<Row[]>(items.map((item) => ({ ...item })));
  const [baseline, setBaseline] = useState(items);
  const hasUnsavedChanges =
    editableSnapshot(draft) !== editableSnapshot(baseline);
  const [saving, setSaving] = useState(false),
    [failure, setFailure] = useState(""),
    [menuId, setMenuId] = useState<string | null>(null),
    [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  useEffect(() => {
    if (!hasUnsavedChanges) {
      setDraft(items.map((item) => ({ ...item })));
      setBaseline(items);
    }
  }, [items, hasUnsavedChanges]);
  useEffect(() => {
    const id = pendingFocus.current;
    if (id && rowInputRefs.current[id]) {
      rowInputRefs.current[id]?.focus();
      pendingFocus.current = null;
    }
  }, [draft]);
  const matches = locateText.trim()
    ? draft
        .filter((item) => {
          const sku = String(item.sku || "");
          const name = String((item.product_snapshot as Row)?.name || "");
          return (
            canonicalSkuSearch(sku).includes(canonicalSkuSearch(locateText)) ||
            name.toLowerCase().includes(locateText.trim().toLowerCase())
          );
        })
        .sort(
          (a, b) =>
            Number(
              String(b.sku).toLowerCase() === locateText.trim().toLowerCase(),
            ) -
            Number(
              String(a.sku).toLowerCase() === locateText.trim().toLowerCase(),
            ),
        )
    : [];
  const locate = (id: string) => {
    rowInputRefs.current[id]?.focus();
    rowInputRefs.current[id]?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
    setLocateOpen(false);
  };
  const advance = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (
      event.key !== "Enter" ||
      event.nativeEvent.isComposing ||
      event.keyCode === 229
    )
      return;
    event.preventDefault();
    if (event.repeat || saving) return;
    const next = draft[index + 1];
    if (next) locate(String(next.id));
    else if (!parent.order_id) {
      nextProductRef.current?.focus();
      nextProductRef.current?.select();
    }
  };
  const edited = hasUnsavedChanges;
  const dirty =
    edited ||
    draft.some(
      (item) =>
        packingQuantity(item) > 0 &&
        number(item.quantity) !== packingQuantity(item),
    );
  useAppDraft(hasUnsavedChanges);
  const change = (row: number, key: string, value: string) =>
    setDraft((current) =>
      current.map((item, index) =>
        index === row ? { ...item, [key]: value } : item,
      ),
    );
  const inputValue = (value: unknown) =>
    value === 0 || value === "" || value == null ? "" : String(value);
  const changeUnit = (row: number, value: string) =>
    setDraft((current) =>
      current.map((item, index) =>
        index === row
          ? {
              ...item,
              product_snapshot: {
                ...((item.product_snapshot as Row) || {}),
                unit: value,
              },
            }
          : item,
      ),
    );
  const total = draft.reduce(
    (sum, item) => ({
      quantity: sum.quantity + packingQuantity(item),
      cartons: sum.cartons + number(item.cartons),
      cbm:
        sum.cbm +
        (number(item.length_cm) *
          number(item.width_cm) *
          number(item.height_cm) *
          number(item.cartons)) /
          1_000_000,
      weight: sum.weight + number(item.carton_weight_kg) * number(item.cartons),
    }),
    { quantity: 0, cartons: 0, cbm: 0, weight: 0 },
  );
  const addCatalogProduct = (snapshot: CatalogSnapshot) => {
    const values = packingCatalogValues(snapshot);
    if (
      !values.sku ||
      draft.some(
        (item) =>
          item.sanity_product_id === values.sanity_product_id ||
          item.sku === values.sku,
      )
    )
      return;
    const id = `catalog-${values.sanity_product_id || values.sku}-${draft.length}`;
    pendingFocus.current = id;
    setDraft((current) => [
      ...current,
      {
        ...values,
        id,
        source_order_item_id: null,
      },
    ]);
  };
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">装箱产品项</h2>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!edited || saving}
            onClick={() => {
              setDraft(items.map((item) => ({ ...item })));
              setBaseline(items);
            }}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={!dirty || saving}
            onClick={async () => {
              setSaving(true);
              setFailure("");
              try {
                for (let i = 0; i < draft.length; i++)
                  await savePackingItem(
                    provider,
                    parent,
                    draft[i].source_order_item_id
                      ? String(draft[i].source_order_item_id)
                      : "",
                    Object.fromEntries([
                      ...editable.map((key) => [
                        key,
                        draft[i][key] === ""
                          ? key === "qty_per_carton"
                            ? null
                            : 0
                          : draft[i][key],
                      ]),
                      ["quantity", packingQuantity(draft[i])],
                      ["product_snapshot", draft[i].product_snapshot],
                      ["sku", draft[i].sku],
                      ["sanity_product_id", draft[i].sanity_product_id],
                    ]),
                    String(draft[i].id).startsWith("draft-")
                      ? undefined
                      : items.find((item) => item.id === draft[i].id),
                  );
                for (const item of items.filter(
                  (saved) => !draft.some((row) => row.id === saved.id),
                ))
                  await provider.delete("romiku_packing_items", {
                    id: item.id,
                    previousData: item,
                  });
                await onSaved();
                setBaseline(draft);
              } catch (cause) {
                setFailure(
                  cause instanceof Error
                    ? cause.message
                    : "保存装箱产品项失败。",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            保存
          </Button>
        </div>
      </div>
      {parent.order_id ? (
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            已在创建时自动导入此订单全部剩余产品。
          </p>
          <div className="relative w-64 max-w-full">
            <input
              aria-label="搜索本单产品"
              placeholder="查找本单 SKU / 产品名称"
              className="w-full rounded border p-1"
              value={locateText}
              onChange={(event) => {
                setLocateText(event.target.value);
                setLocateOpen(true);
                setLocateIndex(0);
              }}
              onFocus={() => setLocateOpen(true)}
              onBlur={() => setLocateOpen(false)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.keyCode === 229)
                  return;
                if (event.key === "Escape") {
                  event.preventDefault();
                  setLocateOpen(false);
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setLocateIndex((i) => Math.min(i + 1, matches.length - 1));
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setLocateIndex((i) => Math.max(i - 1, 0));
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (!event.repeat && locateOpen && matches[locateIndex])
                    locate(String(matches[locateIndex].id));
                }
              }}
            />
            {locateOpen && locateText.trim() && (
              <ul
                role="listbox"
                aria-label="本单产品结果"
                className="absolute z-20 max-h-80 w-full overflow-y-auto rounded border bg-background shadow-md"
              >
                {!matches.length && <li className="p-2">未找到本单产品</li>}
                {matches.map((item, index) => (
                  <li key={String(item.id)}>
                    <button
                      type="button"
                      aria-selected={locateIndex === index}
                      className={`flex h-10 w-full items-center gap-2 px-2 text-left hover:bg-muted ${locateIndex === index ? "bg-muted" : ""}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => locate(String(item.id))}
                    >
                      <ProductSnapshotImage
                        sku={String(item.sku || "")}
                        imageUrl={(item.product_snapshot as Row)?.image_url}
                        sizeClassName="h-[30px] w-[30px] shrink-0"
                      />
                      <span className="min-w-0 truncate">
                        <strong>{String(item.sku)}</strong> ·{" "}
                        {String((item.product_snapshot as Row)?.name || "")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm">从产品库添加产品</span>
          <ProductLibraryLookup
            wideCommercial
            inputRef={nextProductRef}
            capturePacking
            includeUnit
            onManualSku={() => undefined}
            onSelected={addCatalogProduct}
          />
        </div>
      )}
      <div className="w-full min-w-0 overflow-x-auto">
        <table className="w-full min-w-[1440px] table-fixed text-sm">
          <colgroup>
            {packingColumnKeys.map((key, index) => (
              <col key={key} style={{ width: packingColumnWidths[index] }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {[
                "No.",
                "货号",
                "产品名称",
                "图片",
                "产品规格",
                "箱数",
                "Qty/Ctn",
                "Unit",
                "总数量",
                "长(cm)",
                "宽(cm)",
                "高(cm)",
                "CBM",
                "Weight",
                "Total CBM",
                "Total Weight",
                "操作",
              ].map((label) => (
                <th className="whitespace-nowrap p-2 text-left" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draft.map((item, index) => {
              const computed = packingComputedValues(item);
              const input = (key: string) => (
                <input
                  aria-label={`${key} ${item.sku}`}
                  ref={
                    key === "cartons"
                      ? (element) => {
                          rowInputRefs.current[String(item.id)] = element;
                        }
                      : undefined
                  }
                  onKeyDown={(event) => advance(event, index)}
                  className="block w-full min-w-0 rounded border p-1 text-right"
                  type="number"
                  min="0"
                  step={key === "cartons" ? "1" : "any"}
                  placeholder="0"
                  value={inputValue(item[key])}
                  onChange={(event) => change(index, key, event.target.value)}
                />
              );
              const calculated = (key: string, value: number | string) => (
                <input
                  aria-label={`${key} ${item.sku}`}
                  className="block w-full min-w-0 bg-transparent p-1 text-right tabular-nums"
                  readOnly
                  value={value}
                />
              );
              return (
                <tr className="border-t" key={String(item.id)}>
                  <td className="p-2">{index + 1}</td>
                  <td className="p-2">{String(item.sku || "")}</td>
                  <td className="p-2">
                    {String((item.product_snapshot as any)?.name || "")}
                  </td>
                  <td className="p-2">
                    <ProductSnapshotImage
                      sku={String(item.sku || "")}
                      imageUrl={(item.product_snapshot as Row)?.image_url}
                      sizeClassName="h-8 w-8"
                    />
                  </td>
                  <td className="break-words p-2">
                    {String(
                      (item.product_snapshot as Row)?.specification || "",
                    )}
                  </td>
                  <td className="min-w-0 p-1">{input("cartons")}</td>
                  <td className="min-w-0 p-1">{input("qty_per_carton")}</td>
                  <td className="min-w-0 p-1">
                    <input
                      aria-label={`unit ${item.sku}`}
                      onKeyDown={(event) => advance(event, index)}
                      className="block w-full min-w-0 rounded border p-1"
                      value={String((item.product_snapshot as Row)?.unit || "")}
                      onChange={(event) =>
                        changeUnit(index, event.target.value)
                      }
                    />
                  </td>
                  <td className="min-w-0 p-1">
                    {calculated("quantity", computed.quantity)}
                  </td>
                  {["length_cm", "width_cm", "height_cm"].map((key) => (
                    <td className="min-w-0 p-1" key={key}>
                      {input(key)}
                    </td>
                  ))}
                  <td className="min-w-0 p-1">
                    {calculated(
                      "carton_cbm",
                      computed.perCbm.replace(" m³", ""),
                    )}
                  </td>
                  <td className="min-w-0 p-1">{input("carton_weight_kg")}</td>
                  <td className="min-w-0 p-1">
                    {calculated(
                      "total_cbm",
                      computed.totalCbm.replace(" m³", ""),
                    )}
                  </td>
                  <td className="min-w-0 p-1">
                    {calculated(
                      "total_weight_kg",
                      computed.totalWeight.replace(" kg", ""),
                    )}
                  </td>
                  <td className="relative p-1 text-center">
                    <Button
                      aria-label={`更多操作 ${item.sku}`}
                      className="h-7 w-7 p-0"
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setMenuId((current) =>
                          current === String(item.id) ? null : String(item.id),
                        )
                      }
                    >
                      ⋯
                    </Button>
                    {menuId === String(item.id) && (
                      <div className="absolute right-0 z-10 mt-1 rounded border bg-background p-1 shadow">
                        <Button
                          className="whitespace-nowrap"
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setMenuId(null);
                            setPendingDelete(item);
                          }}
                        >
                          从此装箱单删除
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t font-semibold">
              <td colSpan={5}>合计</td>
              <td className="text-right">{total.cartons}</td>
              <td colSpan={2} />
              <td className="text-right">{total.quantity}</td>
              <td colSpan={5} />
              <td className="whitespace-nowrap text-right">
                {total.cbm.toFixed(3)} m³
              </td>
              <td className="whitespace-nowrap text-right">
                {total.weight.toFixed(2)} kg
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {pendingDelete && (
        <div
          className="flex items-center gap-2 rounded border p-3"
          role="alertdialog"
        >
          <p>确认从当前装箱单移除此产品？</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setPendingDelete(null)}
          >
            返回
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              setDraft((current) =>
                current.filter((item) => item.id !== pendingDelete.id),
              );
              setPendingDelete(null);
            }}
          >
            确认移除
          </Button>
        </div>
      )}
      {failure && <p role="alert">{failure}</p>}
    </section>
  );
}
