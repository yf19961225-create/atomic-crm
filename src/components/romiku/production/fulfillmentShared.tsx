import { useDataProvider } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { readRelated } from "../outbound/workflow";

export const fulfillmentConfig = {
  production: {
    resource: "romiku_production_orders",
    items: "romiku_production_items",
    path: "/production",
    label: "Production Order",
    plural: "Production",
    foreignKey: "production_order_id",
  },
  packing: {
    resource: "romiku_packing_lists",
    items: "romiku_packing_items",
    path: "/packing-shipping",
    label: "Packing List",
    plural: "Packing & Shipping",
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
      Order{" "}
      <select
        className="rounded border p-2"
        aria-label="Order"
        required
        value={value}
        disabled={query.isPending || !!query.error}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choose Order</option>
        {query.data?.map((o) => (
          <option key={o.id} value={o.id}>
            {o.document_number || o.id} · {o.counterparty_snapshot?.name}
          </option>
        ))}
      </select>
      {query.error && (
        <span role="alert">
          Could not load Orders.{" "}
          <button type="button" onClick={() => query.refetch()}>
            Retry
          </button>
        </span>
      )}
    </label>
  );
}
