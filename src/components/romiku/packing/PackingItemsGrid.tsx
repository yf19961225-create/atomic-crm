import { useEffect, useState } from "react";
import { useDataProvider, type RaRecord } from "ra-core";
import { Button } from "@/components/ui/button";
import { readRelated } from "../outbound/workflow";
import { savePackingItem } from "./packingWorkflow";

type Row = RaRecord & { [key: string]: unknown };
const editable = [
  "quantity",
  "cartons",
  "qty_per_carton",
  "length_cm",
  "width_cm",
  "height_cm",
  "carton_weight_kg",
];
const number = (value: unknown) => Number(value || 0);
export const packingColumnKeys = [
  "no",
  "sku",
  "name",
  "image",
  "quantity",
  "cartons",
  "qty_per_carton",
  "length_cm",
  "width_cm",
  "height_cm",
  "per_cbm",
  "total_cbm",
  "carton_weight_kg",
  "total_weight",
] as const;
export const packingColumnWidths = [
  "3%",
  "8%",
  "14%",
  "5%",
  "7%",
  "6%",
  "7%",
  "6%",
  "6%",
  "6%",
  "8%",
  "8%",
  "8%",
  "8%",
] as const;

export function packingComputedValues(item: Row) {
  const perCbm =
    (number(item.length_cm) * number(item.width_cm) * number(item.height_cm)) /
    1_000_000;
  return {
    perCbm: `${perCbm.toFixed(3)} m³`,
    totalCbm: `${(perCbm * number(item.cartons)).toFixed(3)} m³`,
    totalWeight: `${(number(item.carton_weight_kg) * number(item.cartons)).toFixed(2)} kg`,
  };
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
  const [draft, setDraft] = useState<Row[]>(items.map((item) => ({ ...item })));
  const [saving, setSaving] = useState(false),
    [sources, setSources] = useState<Row[]>([]),
    [sourceId, setSourceId] = useState(""),
    [failure, setFailure] = useState("");
  useEffect(() => {
    setDraft(items.map((item) => ({ ...item })));
  }, [items]);
  useEffect(() => {
    let cancelled = false;
    readRelated(provider, "romiku_order_items", { order_id: parent.order_id })
      .then((data) => !cancelled && setSources(data))
      .catch(() => !cancelled && setFailure("无法加载订单产品项。"));
    return () => {
      cancelled = true;
    };
  }, [parent.order_id, provider]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(items);
  const change = (row: number, key: string, value: string) =>
    setDraft((current) =>
      current.map((item, index) =>
        index === row
          ? { ...item, [key]: value === "" ? "" : Number(value) }
          : item,
      ),
    );
  const total = draft.reduce(
    (sum, item) => ({
      quantity: sum.quantity + number(item.quantity),
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
  const addSource = async () => {
    const source = sources.find((item) => String(item.id) === sourceId);
    if (
      !source ||
      draft.some((item) => item.source_order_item_id === source.id)
    )
      return;
    setFailure("");
    try {
      const suppliers = await readRelated(
        provider,
        "romiku_product_suppliers",
        {},
      );
      const matches = suppliers.filter(
        (supplier) =>
          supplier.sanity_product_id === source.sanity_product_id ||
          (!supplier.sanity_product_id && supplier.sku === source.sku),
      );
      const procurement =
        matches.find((supplier) => supplier.preferred) ??
        (matches.length === 1 ? matches[0] : undefined);
      setDraft((current) => [
        ...current,
        {
          id: `draft-${source.id}`,
          source_order_item_id: source.id,
          sku: source.sku,
          product_snapshot: structuredClone(source.product_snapshot || {}),
          quantity: source.quantity,
          cartons: 0,
          qty_per_carton: procurement?.qty_per_carton ?? null,
          length_cm: procurement?.length_cm ?? 0,
          width_cm: procurement?.width_cm ?? 0,
          height_cm: procurement?.height_cm ?? 0,
          carton_weight_kg: procurement?.carton_weight_kg ?? 0,
        },
      ]);
      setSourceId("");
    } catch {
      setFailure("无法加载供应商装箱默认值。请稍后重试。");
    }
  };
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">装箱产品项</h2>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!dirty || saving}
            onClick={() => setDraft(items.map((item) => ({ ...item })))}
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
                    String(draft[i].source_order_item_id),
                    Object.fromEntries(
                      editable.map((key) => [
                        key,
                        draft[i][key] === "" ? 0 : draft[i][key],
                      ]),
                    ),
                    String(draft[i].id).startsWith("draft-")
                      ? undefined
                      : items.find((item) => item.id === draft[i].id),
                  );
                await onSaved();
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
      <div className="flex items-center gap-2">
        <label className="text-sm" htmlFor="packing-order-item">
          从订单加入产品
        </label>
        <select
          id="packing-order-item"
          className="rounded border p-1"
          value={sourceId}
          onChange={(event) => setSourceId(event.target.value)}
        >
          <option value="">选择订单产品项</option>
          {sources
            .filter(
              (source) =>
                !draft.some((item) => item.source_order_item_id === source.id),
            )
            .map((source) => (
              <option value={String(source.id)} key={source.id}>
                {String(source.sku || "—")} ·{" "}
                {String((source.product_snapshot as Row)?.name || "产品")}
              </option>
            ))}
        </select>
        <Button
          type="button"
          variant="outline"
          disabled={!sourceId || saving}
          onClick={addSource}
        >
          加入
        </Button>
      </div>
      <div className="w-full min-w-0 overflow-x-auto">
        <table className="w-full min-w-0 table-fixed text-sm">
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
                "总数量",
                "箱数",
                "Qty/Ctn",
                "长(cm)",
                "宽(cm)",
                "高(cm)",
                "单箱体积",
                "总体积",
                "单箱重量",
                "总重量",
              ].map((label) => (
                <th className="whitespace-nowrap p-2 text-left" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draft.map((item, index) => {
              const computed = packingComputedValues(item),
                warning =
                  item.qty_per_carton &&
                  number(item.quantity) !==
                    number(item.cartons) * number(item.qty_per_carton);
              return (
                <tr className="border-t" key={String(item.id)}>
                  <td className="p-2">{index + 1}</td>
                  <td className="p-2">{String(item.sku || "")}</td>
                  <td className="p-2">
                    {String((item.product_snapshot as any)?.name || "")}
                  </td>
                  <td className="p-2">
                    {(item.product_snapshot as any)?.image_url && (
                      <img
                        className="h-8 w-8 object-cover"
                        src={(item.product_snapshot as any).image_url}
                        alt=""
                      />
                    )}
                  </td>
                  {editable.map((key) =>
                    key === "carton_weight_kg" ? null : (
                      <td className="min-w-0 p-1 text-right" key={key}>
                        <input
                          aria-label={`${key} ${item.sku}`}
                          className="block w-full min-w-0 rounded border p-1 text-right"
                          type="number"
                          step="any"
                          value={String(item[key] ?? "")}
                          onChange={(event) =>
                            change(index, key, event.target.value)
                          }
                        />
                        {key === "qty_per_carton" && warning && (
                          <span title="数量与箱数×Qty/Ctn 不一致；允许尾箱">
                            ⚠
                          </span>
                        )}
                      </td>
                    ),
                  )}
                  <td className="whitespace-nowrap p-2 text-right">
                    {computed.perCbm}
                  </td>
                  <td className="whitespace-nowrap p-2 text-right">
                    {computed.totalCbm}
                  </td>
                  <td className="min-w-0 p-1 text-right">
                    <input
                      aria-label={`carton_weight_kg ${item.sku}`}
                      className="block w-full min-w-0 rounded border p-1 text-right"
                      type="number"
                      step="any"
                      value={String(item.carton_weight_kg ?? "")}
                      onChange={(event) =>
                        change(index, "carton_weight_kg", event.target.value)
                      }
                    />
                  </td>
                  <td className="whitespace-nowrap p-2 text-right">
                    {computed.totalWeight}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t font-semibold">
              <td colSpan={4}>合计</td>
              <td className="text-right">{total.quantity}</td>
              <td className="text-right">{total.cartons}</td>
              <td />
              <td />
              <td />
              <td />
              <td />
              <td className="whitespace-nowrap text-right">
                {total.cbm.toFixed(3)} m³
              </td>
              <td />
              <td className="whitespace-nowrap text-right">
                {total.weight.toFixed(2)} kg
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {failure && <p role="alert">{failure}</p>}
    </section>
  );
}
