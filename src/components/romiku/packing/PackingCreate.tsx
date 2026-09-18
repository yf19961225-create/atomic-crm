import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useDataProvider } from "ra-core";
import { Button } from "@/components/ui/button";
import { errorMessage } from "../outbound/RelatedRecords";
import { OrderSelect } from "../production/fulfillmentShared";

export function PackingCreate() {
  const provider = useDataProvider(),
    navigate = useNavigate(),
    [params] = useSearchParams();
  const [orderId, setOrderId] = useState(params.get("order") || ""),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailure("");
    try {
      if (!orderId) throw new Error("请选择订单。");
      await provider.getOne("romiku_orders", { id: orderId });
      const { data } = await provider.create("romiku_packing_lists", {
        data: { order_id: orderId },
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
      <p>一张订单可对应多张装箱单。创建后可从剩余产品项中分配部分数量。</p>
      <form onSubmit={create}>
        <fieldset disabled={busy} className="space-y-4">
          <OrderSelect value={orderId} onChange={setOrderId} />
          <Button type="submit" disabled={!orderId}>
            创建装箱单
          </Button>
        </fieldset>
      </form>
      {failure && <p role="alert">{failure}</p>}
    </section>
  );
}
