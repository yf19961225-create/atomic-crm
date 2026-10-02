import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useDataProvider } from "ra-core";
import { Button } from "@/components/ui/button";
import { errorMessage } from "../outbound/RelatedRecords";
import { OrderSelect } from "../production/fulfillmentShared";
import { defaultPackingSellerSnapshot } from "./packingExportSnapshot";

export function PackingCreate() {
  const provider = useDataProvider(),
    navigate = useNavigate(),
    [params] = useSearchParams();
  const [orderId, setOrderId] = useState(params.get("order") || ""),
    [creationMode, setCreationMode] = useState<"order" | "independent">(
      "order",
    ),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailure("");
    try {
      const isOrderBacked = creationMode === "order";
      if (isOrderBacked && !orderId) throw new Error("请选择订单。");
      const order = isOrderBacked
        ? (
            await provider.getOne("romiku_orders", {
              id: orderId,
            })
          ).data
        : null;
      const { data } = await provider.create("romiku_packing_lists", {
        data: {
          order_id: isOrderBacked ? orderId : null,
          packing_at: new Date().toISOString(),
          seller_snapshot: defaultPackingSellerSnapshot(),
          buyer_snapshot: structuredClone(order?.counterparty_snapshot || {}),
        },
      });
      navigate(`/packing-shipping/${data.id}`);
    } catch (cause) {
      setFailure(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      <Link className="underline" to="/packing-shipping">
        返回装箱与发运
      </Link>
      <h1 className="text-3xl font-semibold">新建装箱单</h1>
      <p>可从订单分配产品，也可直接建立独立装箱单。</p>
      <form onSubmit={create}>
        <fieldset disabled={busy} className="space-y-4">
          <label className="flex items-center gap-2">
            <input
              checked={creationMode === "order"}
              name="packing-create-mode"
              type="radio"
              onChange={() => setCreationMode("order")}
            />
            从 Order 创建
          </label>
          <label className="flex items-center gap-2">
            <input
              aria-label="直接创建 / 不关联订单"
              checked={creationMode === "independent"}
              name="packing-create-mode"
              type="radio"
              onChange={() => setCreationMode("independent")}
            />
            直接创建 / 不关联订单
          </label>
          {creationMode === "order" && (
            <OrderSelect value={orderId} onChange={setOrderId} />
          )}
          <Button type="submit" disabled={creationMode === "order" && !orderId}>
            创建装箱单
          </Button>
        </fieldset>
      </form>
      {failure && <p role="alert">{failure}</p>}
    </section>
  );
}
