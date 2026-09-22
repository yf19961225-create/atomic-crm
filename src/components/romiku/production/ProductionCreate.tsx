import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useDataProvider, type RaRecord } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { readRelated } from "../outbound/workflow";
import { errorMessage } from "../outbound/RelatedRecords";
import {
  createProductionOrders,
  ProductionCreationError,
  type ProductionSelection,
} from "./productionWorkflow";
import { OrderSelect } from "./fulfillmentShared";

export function ProductionCreate() {
  const provider = useDataProvider(),
    [params] = useSearchParams();
  const [orderId, setOrderId] = useState(params.get("order") || "");
  const [selections, setSelections] = useState<
    Record<string, ProductionSelection>
  >({});
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(""),
    [created, setCreated] = useState<RaRecord[] | null>(null);
  const items = useQuery({
    queryKey: ["production-source-items", orderId],
    queryFn: () =>
      readRelated(provider, "romiku_order_items", { order_id: orderId }),
    enabled: !!orderId,
  });
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailure("");
    try {
      setCreated(
        await createProductionOrders(
          provider,
          orderId,
          Object.values(selections),
        ),
      );
    } catch (cause) {
      setFailure(errorMessage(cause));
      if (cause instanceof ProductionCreationError && cause.documents.length)
        setCreated(cause.documents);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      <Link className="underline" to="/production">
        返回生产管理
      </Link>
      <h1 className="text-3xl font-semibold">新建生产单</h1>
      <p>选择订单产品项并填写生产数量；一次提交创建一张生产单。</p>
      <form className="space-y-4" onSubmit={create}>
        <fieldset disabled={busy || created !== null} className="space-y-4">
          <OrderSelect
            value={orderId}
            onChange={(id) => {
              setOrderId(id);
              setSelections({});
            }}
          />
          {items.error && (
            <p role="alert">
              无法加载订单产品项。{" "}
              <Button
                type="button"
                onClick={() => {
                  void items.refetch();
                }}
              >
                重试
              </Button>
            </p>
          )}
          {orderId && items.isPending && <p>正在加载订单产品项…</p>}
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {["选择", "SKU / 产品", "箱数", "订单数量", "生产数量"].map(
                    (s) => (
                      <th key={s} className="p-3">
                        {s}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {items.data?.map((item) => {
                  const selected = selections[String(item.id)];
                  const change = (patch: Partial<ProductionSelection>) =>
                    setSelections({
                      ...selections,
                      [item.id]: { ...selected, ...patch },
                    });
                  return (
                    <tr key={item.id} className="border-t">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          aria-label={`选择 ${item.sku}`}
                          checked={!!selected}
                          onChange={(e) => {
                            if (e.target.checked)
                              setSelections({
                                ...selections,
                                [item.id]: {
                                  itemId: String(item.id),
                                  quantity: Number(item.quantity),
                                },
                              });
                            else
                              setSelections(
                                Object.fromEntries(
                                  Object.entries(selections).filter(
                                    ([id]) => id !== String(item.id),
                                  ),
                                ),
                              );
                          }}
                        />
                      </td>
                      <td className="p-3">
                        {item.sku} · {item.product_snapshot?.name}
                      </td>
                      <td className="p-3">
                        {(() => {
                          const snapshot = item.packing_snapshot as
                            | Record<string, unknown>
                            | undefined;
                          const cartons =
                            snapshot?.cartons ?? snapshot?.carton_qty;
                          return cartons == null || cartons === ""
                            ? "—"
                            : String(cartons);
                        })()}
                      </td>
                      <td className="p-3">{item.quantity}</td>
                      <td className="p-3">
                        <input
                          className="rounded border p-2"
                          type="number"
                          step="any"
                          min="0.0001"
                          disabled={!selected}
                          aria-label={`生产数量 ${item.sku}`}
                          value={selected?.quantity ?? ""}
                          onChange={(e) =>
                            change({ quantity: Number(e.target.value) })
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {items.data?.length === 0 && <p>此订单没有产品项。</p>}
          <Button
            type="submit"
            disabled={!Object.keys(selections).length || !!items.error}
          >
            创建生产单
          </Button>
        </fieldset>
      </form>
      {failure && <p role="alert">{failure}</p>}
      {created && (
        <div className="space-y-2">
          <p role="status">
            {failure ? "已保存单据待复核" : `已创建 ${created.length} 张生产单`}
          </p>
          {created.map((record) => (
            <p key={record.id}>
              <Link className="underline" to={`/production/${record.id}`}>
                {record.document_number ||
                  record.supplier_snapshot?.name ||
                  "未指定供应商"}
              </Link>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
