import { useState } from "react";
import { useDataProvider, type RaRecord } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  WorkflowFields,
  type Field,
  type Values,
} from "../outbound/WorkflowFields";
import { readRelated } from "../outbound/workflow";
import { errorMessage } from "../outbound/RelatedRecords";
import { packingTotals, savePackingItem } from "../packing/packingWorkflow";
import { saveProductionItem } from "./productionWorkflow";
import type { FulfillmentKind } from "./fulfillmentShared";

const snapshotFields: Field[] = [
  { key: "product_snapshot.name", label: "产品名称" },
  {
    key: "product_snapshot.image_url",
    label: "产品图片 URL",
    type: "url",
  },
  { key: "quantity", label: "数量", required: true },
];
const packingFields: Field[] = [
  { key: "cartons", label: "箱数" },
  { key: "qty_per_carton", label: "每箱数量" },
  { key: "length_cm", label: "长度（cm）" },
  { key: "width_cm", label: "宽度（cm）" },
  { key: "height_cm", label: "高度（cm）" },
  { key: "carton_weight_kg", label: "每箱重量（kg）" },
  { key: "product_snapshot.shipping_mark", label: "产品唛头" },
  { key: "remark", label: "备注", type: "textarea" },
];
export function FulfillmentItems({
  kind,
  parent,
  items,
  onChanged,
}: {
  kind: FulfillmentKind;
  parent: RaRecord;
  items: RaRecord[];
  onChanged: () => Promise<unknown>;
}) {
  const provider = useDataProvider();
  const [editing, setEditing] = useState<RaRecord | "new" | null>(null);
  const totals = packingTotals(items);
  const sourceItems = useQuery({
    queryKey: ["fulfillment-source-order-items", parent.order_id],
    queryFn: () =>
      readRelated(provider, "romiku_order_items", {
        order_id: parent.order_id,
      }),
    enabled: kind === "production",
  });
  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <h2 className="text-xl font-semibold">产品项</h2>
        <Button disabled={editing !== null} onClick={() => setEditing("new")}>
          添加{kind === "packing" ? "装箱" : "生产"}产品项
        </Button>
      </div>
      {kind === "packing" && (
        <p>
          合计：{totals.cartons} 箱 · {totals.cbm.toFixed(3)} m³ ·{" "}
          {totals.weight.toFixed(2)} kg
        </p>
      )}
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {[
                "货号",
                kind === "production" ? "产品名称" : "产品",
                "图片",
                ...(kind === "production"
                  ? ["箱数", "生产数量", "总数量"]
                  : ["数量"]),
                ...(kind === "packing"
                  ? ["箱数", "CBM", "重量", "唛头 / 备注"]
                  : []),
                "操作",
              ].map((label) => (
                <th className="p-3" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const total = packingTotals([item]);
              const source = sourceItems.data?.find(
                (candidate) =>
                  String(candidate.id) === String(item.source_order_item_id),
              );
              return (
                <tr key={item.id} className="border-t">
                  <td className="p-3">{item.sku}</td>
                  <td className="p-3">{item.product_snapshot?.name}</td>
                  <td className="p-3">
                    {/^https?:\/\//i.test(
                      item.product_snapshot?.image_url || "",
                    ) && (
                      <img
                        className="h-12 w-12 object-contain"
                        src={item.product_snapshot.image_url}
                        alt={item.product_snapshot?.name || item.sku}
                      />
                    )}
                  </td>
                  {kind === "production" && (
                    <td className="p-3">
                      {item.packaging_snapshot?.cartons ??
                        item.packaging_snapshot?.carton_qty ??
                        "—"}
                    </td>
                  )}
                  <td className="p-3">{item.quantity}</td>
                  {kind === "production" && (
                    <td className="p-3">
                      {source?.quantity ??
                        item.packaging_snapshot?.order_quantity ??
                        "—"}
                    </td>
                  )}
                  {kind === "packing" ? (
                    <>
                      <td className="p-3">{item.cartons}</td>
                      <td className="p-3">{total.cbm.toFixed(3)}</td>
                      <td className="p-3">{total.weight.toFixed(2)}</td>
                      <td className="p-3">
                        {item.product_snapshot?.shipping_mark} {item.remark}
                      </td>
                    </>
                  ) : null}
                  <td className="p-3">
                    <Button
                      variant="outline"
                      disabled={editing !== null}
                      onClick={() => setEditing(item)}
                    >
                      编辑{kind === "packing" ? "装箱" : "生产"}产品项
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!items.length && <p>暂无产品项。</p>}
      {editing !== null && (
        <ItemEditor
          key={editing === "new" ? "new" : editing.id}
          kind={kind}
          parent={parent}
          previous={editing === "new" ? undefined : editing}
          onSaved={async () => {
            await onChanged();
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
function ItemEditor({
  kind,
  parent,
  previous,
  onSaved,
  onCancel,
}: {
  kind: FulfillmentKind;
  parent: RaRecord;
  previous?: RaRecord;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const provider = useDataProvider();
  const [sourceId, setSourceId] = useState(
    String(previous?.source_order_item_id || ""),
  );
  const [values, setValues] = useState<Values>(
      previous || { quantity: "", cartons: 0 },
    ),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  const sources = useQuery({
    queryKey: ["fulfillment-sources", parent.order_id],
    queryFn: () =>
      readRelated(provider, "romiku_order_items", {
        order_id: parent.order_id,
      }),
  });
  const remaining = useQuery({
    queryKey: ["packing-remaining", parent.order_id],
    queryFn: () =>
      readRelated(provider, "romiku_order_item_remaining", {
        order_id: parent.order_id,
      }),
    enabled: kind === "packing",
    staleTime: 0,
  });
  const available = remaining.data?.find((r) => String(r.id) === sourceId);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailure("");
    try {
      if (!sourceId) throw new Error("请选择订单产品项。");
      if (kind === "packing")
        await savePackingItem(provider, parent, sourceId, values, previous);
      else
        await saveProductionItem(provider, parent, sourceId, values, previous);
      await remaining.refetch();
      await onSaved();
    } catch (cause) {
      setFailure(errorMessage(cause));
      void remaining.refetch();
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="space-y-4 rounded border p-4" onSubmit={save}>
      <h3 className="font-semibold">
        {previous ? "编辑" : "新建"}
        {kind === "packing" ? "装箱" : "生产"}产品项
      </h3>
      <fieldset className="space-y-4" disabled={busy}>
        <label className="block">
          订单产品项{" "}
          <select
            className="rounded border p-2"
            aria-label="订单产品项"
            required
            disabled={!!previous || sources.isPending || !!sources.error}
            value={sourceId}
            onChange={(e) => {
              setSourceId(e.target.value);
              const source = sources.data?.find(
                (s) => String(s.id) === e.target.value,
              );
              setValues({
                quantity: "",
                cartons: 0,
                product_snapshot: structuredClone(
                  source?.product_snapshot || {},
                ),
                packaging_snapshot: structuredClone(
                  source?.packing_snapshot || {},
                ),
              });
            }}
          >
            <option value="">请选择订单产品项</option>
            {sources.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.sku} · {s.product_snapshot?.name}
              </option>
            ))}
          </select>
        </label>
        {(sources.error || remaining.error) && (
          <p role="alert">
            无法加载订单产品项或剩余数量。{" "}
            <Button
              type="button"
              onClick={() => {
                void sources.refetch();
                void remaining.refetch();
              }}
            >
              重试
            </Button>
          </p>
        )}
        {kind === "packing" && available && (
          <p>
            已订购：{available.ordered_quantity} · 已装箱：{" "}
            {available.packed_quantity} · 剩余： {available.remaining_quantity}
          </p>
        )}
        {kind === "packing" && previous && (
          <p>此行已占用 {previous.quantity}；编辑时可使用该数量。</p>
        )}
        <WorkflowFields
          fields={[
            ...snapshotFields,
            ...(kind === "packing"
              ? packingFields
              : [
                  {
                    key: "production_note_zh",
                    label: "生产备注（中文）",
                    type: "textarea" as const,
                  },
                  {
                    key: "packaging_snapshot.notes",
                    label: "包装备注",
                    type: "textarea" as const,
                  },
                ]),
          ]}
          values={values}
          onChange={setValues}
        />
        <div className="flex gap-3">
          <Button
            type="submit"
            disabled={
              !sourceId ||
              !!sources.error ||
              (kind === "packing" && (remaining.isPending || !!remaining.error))
            }
          >
            保存{kind === "packing" ? "装箱" : "生产"}产品项
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            取消
          </Button>
        </div>
      </fieldset>
      {failure && <p role="alert">{failure}</p>}
    </form>
  );
}
