import { Link } from "react-router";
import type { RaRecord } from "ra-core";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
export type ProductionAllocation = {
  id: string;
  document_number: string;
  quantity: number;
  status?: string;
  archived_at?: string | null;
};
export type AllocatedOrderItem = RaRecord & {
  ordered_quantity: number;
  production_quantity: number;
  unallocated_quantity: number;
  allocations: ProductionAllocation[];
};
export type AllocationIssue = {
  sku: string;
  ordered_quantity: number;
  other_quantity: number;
  this_quantity: number;
  total_quantity: number;
  excess_quantity: number;
  allocations: ProductionAllocation[];
};
export async function readProductionAllocations(
  orderId: string,
): Promise<AllocatedOrderItem[]> {
  const { data, error } = await getSupabaseClient().rpc(
    "romiku_production_allocations",
    { source_order_id: orderId },
  );
  if (error || !Array.isArray(data))
    throw new Error("无法读取生产安排，请刷新后重试。");
  return data;
}
export function AllocationLinks({
  allocations,
}: {
  allocations: ProductionAllocation[];
}) {
  return (
    <ul className="space-y-1">
      {allocations.map((a) => (
        <li key={a.id}>
          <Link className="underline" to={`/production/${a.id}`}>
            {a.document_number}
          </Link>{" "}
          · {a.quantity}
          {a.archived_at ? "（已归档，仍占用额度）" : ""}
        </li>
      ))}
    </ul>
  );
}
export function AllocationDetails({ item }: { item: AllocatedOrderItem }) {
  return item.allocations.length ? (
    <details className="mt-2 text-sm">
      <summary>查看生产安排 {item.sku}</summary>
      <AllocationLinks allocations={item.allocations} />
      <p>
        已安排 {item.production_quantity} · 剩余{" "}
        {Math.max(0, item.unallocated_quantity)}
      </p>
      {item.unallocated_quantity < 0 && (
        <p className="text-amber-800">
          历史安排已超出 {-item.unallocated_quantity}，请调整已有生产单。
        </p>
      )}
    </details>
  ) : null;
}
export function AllocationBlocker({
  message,
  issues,
}: {
  message: string;
  issues: AllocationIssue[];
}) {
  return (
    <div role="alert" className="space-y-3 rounded border border-amber-500 p-4">
      <p>{message}</p>
      {issues.map((i, index) => (
        <section key={`${i.sku}-${index}`}>
          <h3 className="font-semibold">{i.sku} 的生产安排超过订单数量</h3>
          <p>订单数量：{i.ordered_quantity}</p>
          <p>其他生产单已安排：{i.other_quantity}</p>
          <p>本生产单：{i.this_quantity}</p>
          <p>保存后累计：{i.total_quantity}</p>
          <p>超出：{i.excess_quantity}</p>
          <p>已安排生产单</p>
          <AllocationLinks allocations={i.allocations} />
        </section>
      ))}
    </div>
  );
}
export function documentCapacity(
  item: AllocatedOrderItem,
  productionId: RaRecord["id"],
) {
  return Math.max(
    0,
    Number(item.ordered_quantity) -
      item.allocations
        .filter((a) => a.id !== productionId)
        .reduce((n, a) => n + Number(a.quantity), 0),
  );
}
