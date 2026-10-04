import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useDataProvider, useGetOne, type RaRecord } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { readRelated } from "../outbound/workflow";
import { copyOrderProductionInstructions } from "../marking/productionInstructions";
import { OrderSelect } from "./fulfillmentShared";
import { ProductionWorkbench } from "./ProductionWorkbench";
import { savedBuyerName } from "./productionWorkspace";
export function ProductionCreate() {
  const provider = useDataProvider(),
    [params] = useSearchParams(),
    lockedOrder = params.get("order");
  const [orderId, setOrderId] = useState(lockedOrder || ""),
    [selection, setSelection] = useState<Record<string, string>>({}),
    [draft, setDraft] = useState<{
      record: RaRecord;
      items: RaRecord[];
      order: RaRecord;
    } | null>(null),
    [failure, setFailure] = useState("");
  const order = useGetOne(
    "romiku_orders",
    { id: orderId },
    { enabled: !!orderId },
  );
  const items = useQuery({
    queryKey: ["production-source-items", orderId],
    queryFn: () =>
      readRelated(provider, "romiku_order_items", { order_id: orderId }),
    enabled: !!orderId,
  });
  function next() {
    try {
      if (!order.data || !items.data) throw new Error("请先载入订单与产品。");
      const lines = items.data
        .filter((i) => selection[String(i.id)] !== undefined)
        .map((i) => {
          const quantity = Number(selection[String(i.id)]);
          if (!Number.isFinite(quantity) || quantity <= 0)
            throw new Error("生产数量必须大于零。");
          return {
            id: crypto.randomUUID(),
            isNew: true,
            source_order_item_id: i.id,
            sku: i.sku,
            quantity,
            product_snapshot: structuredClone(i.product_snapshot || {}),
            packaging_snapshot: structuredClone(i.packing_snapshot || {}),
            marking_override: { mode: "inherit" },
          };
        });
      if (!lines.length) throw new Error("请至少选择一个产品。");
      setDraft({
        order: structuredClone(order.data),
        record: {
          id: "new",
          order_id: orderId,
          status: "pending",
          marking_snapshot: copyOrderProductionInstructions(order.data),
        },
        items: lines,
      });
      setFailure("");
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "无法打开编辑工作台。");
    }
  }
  if (draft)
    return (
      <ProductionWorkbench
        record={draft.record}
        items={draft.items}
        order={draft.order}
        isNew
        onCancel={() => setDraft(null)}
        onSaved={async () => {}}
      />
    );
  return (
    <section className="space-y-4">
      <Link
        className="underline"
        to={lockedOrder ? `/orders/${lockedOrder}` : "/production"}
      >
        返回{lockedOrder ? "所属订单" : "生产管理"}
      </Link>
      <h1 className="text-3xl font-semibold">新建生产单</h1>
      <p>
        先选择产品和本次数量，再一次编辑统一要求及全部产品；点击保存后才创建生产单。
      </p>
      {lockedOrder ? (
        <p>
          所属订单：
          <Link className="underline" to={`/orders/${lockedOrder}`}>
            {order.data?.document_number || "正在加载订单…"}
          </Link>{" "}
          · {savedBuyerName(order.data)}
        </p>
      ) : (
        <OrderSelect
          value={orderId}
          onChange={(id) => {
            setOrderId(id);
            setSelection({});
          }}
        />
      )}
      {(items.error || order.error) && (
        <p role="alert">
          无法读取所属订单与产品。
          <Button
            onClick={() => {
              void items.refetch();
              void order.refetch();
            }}
          >
            重试
          </Button>
        </p>
      )}
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {["选择", "SKU / 产品", "箱数", "订单数量", "生产数量"].map(
                (s) => (
                  <th className="p-3" key={s}>
                    {s}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {items.data?.map((i) => (
              <tr key={i.id} className="border-t">
                <td className="p-3">
                  <input
                    type="checkbox"
                    aria-label={`选择 ${i.sku}`}
                    checked={selection[String(i.id)] !== undefined}
                    onChange={(e) =>
                      setSelection((old) =>
                        e.target.checked
                          ? { ...old, [i.id]: String(i.quantity) }
                          : Object.fromEntries(
                              Object.entries(old).filter(
                                ([id]) => id !== String(i.id),
                              ),
                            ),
                      )
                    }
                  />
                </td>
                <td className="p-3">
                  {i.sku} · {i.product_snapshot?.name}
                </td>
                <td className="p-3">
                  {i.packing_snapshot?.cartons ??
                    i.packing_snapshot?.carton_qty ??
                    "—"}
                </td>
                <td className="p-3">{i.quantity}</td>
                <td className="p-3">
                  <input
                    className="rounded border p-2"
                    type="number"
                    min="0.0001"
                    step="any"
                    aria-label={`生产数量 ${i.sku}`}
                    disabled={selection[String(i.id)] === undefined}
                    value={selection[String(i.id)] ?? ""}
                    onChange={(e) =>
                      setSelection((old) => ({
                        ...old,
                        [i.id]: e.target.value,
                      }))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {orderId && items.isPending && <p>正在加载订单产品…</p>}
      {items.data?.length === 0 && <p>此订单没有产品项。</p>}
      {failure && <p role="alert">{failure}</p>}
      <Button
        disabled={
          !Object.keys(selection).length || !!items.error || !order.data
        }
        onClick={next}
      >
        下一步：编辑整张生产单
      </Button>
    </section>
  );
}
