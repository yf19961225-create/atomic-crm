import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
export async function updateItemMarking(
  productionId: string,
  itemIds: string[],
  action: "set" | "add" | "reset",
  payload: unknown = {},
) {
  const { data, error } = await getSupabaseClient().rpc(
    "romiku_update_item_marking",
    { production_id: productionId, item_ids: itemIds, action, payload },
  );
  if (error)
    throw new Error("标签修改未完成，请确认所选产品仍属于此生产单并重试。");
  return data;
}
export async function reloadProductionDefaults(productionId: string) {
  const { data, error } = await getSupabaseClient().rpc(
    "romiku_reload_production_defaults",
    { production_id: productionId },
  );
  if (error) throw new Error("无法读取订单默认值。");
  return data;
}
