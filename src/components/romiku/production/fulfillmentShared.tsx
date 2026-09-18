import { useDataProvider } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { readRelated } from "../outbound/workflow";

export const fulfillmentConfig = {
  production: {
    resource: "romiku_production_orders",
    items: "romiku_production_items",
    path: "/production",
    label: "生产单",
    plural: "生产管理",
    foreignKey: "production_order_id",
  },
  packing: {
    resource: "romiku_packing_lists",
    items: "romiku_packing_items",
    path: "/packing-shipping",
    label: "装箱单",
    plural: "装箱与发运",
    foreignKey: "packing_list_id",
  },
};
export type FulfillmentKind = keyof typeof fulfillmentConfig;
export function OrderSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const provider = useDataProvider();
  const query = useQuery({
    queryKey: ["fulfillment-orders"],
    queryFn: () => readRelated(provider, "romiku_orders", {}),
  });
  return (
    <label className="block">
      订单{" "}
      <select
        className="rounded border p-2"
        aria-label="订单"
        required
        value={value}
        disabled={query.isPending || !!query.error}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">请选择订单</option>
        {query.data?.map((o) => (
          <option key={o.id} value={o.id}>
            {o.document_number || o.id} · {o.counterparty_snapshot?.name}
          </option>
        ))}
      </select>
      {query.error && (
        <span role="alert">
          无法加载订单。{" "}
          <button type="button" onClick={() => query.refetch()}>
            重试
          </button>
        </span>
      )}
    </label>
  );
}
