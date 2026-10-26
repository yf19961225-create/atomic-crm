import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
export type ProductionGroupView = "ongoing" | "received" | "cancelled" | "all";
export type ProductionOrderGroup = {
  id: string;
  document_number: string;
  document_date: string;
  customer_name: string;
  production_count: number;
  ongoing_count: number;
  received_count: number;
  cancelled_count: number;
  effective_count: number;
  latest_factory_due_at: string | null;
  latest_created_at: string;
};
export async function readProductionOrderGroups(
  search: string,
  view: ProductionGroupView,
  page: number,
  orderId: string | null,
) {
  const { data, error } = await getSupabaseClient().rpc(
    "romiku_list_production_order_groups",
    {
      p_search: search,
      p_view: view,
      p_page: page,
      p_page_size: 25,
      p_order_id: orderId,
    },
  );
  if (
    error ||
    !data ||
    !Array.isArray(data.rows) ||
    !Number.isSafeInteger(data.total) ||
    data.total < 0
  )
    throw new Error("无法加载生产订单，请重试。");
  return data as { rows: ProductionOrderGroup[]; total: number };
}
