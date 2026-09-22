import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import type { OverlayClient } from "./productProcurementOverlay";

const inValues = (values: string[]) =>
  values.map((value) => `"${value.replaceAll('"', '\\"')}"`).join(",");

const productMatch = (ids: string[], skus: string[]) =>
  `sanity_product_id.in.(${inValues(ids)}),sku.in.(${inValues(skus)})`;

const read = async <T>(
  query: PromiseLike<{ data: T[] | null; error: Error | null }>,
) => {
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
};

export const createSupabaseProcurementOverlayClient = (): OverlayClient => ({
  getExtensions: (ids, skus) =>
    read(
      getSupabaseClient()
        .from("romiku_product_extensions")
        .select("id,sanity_product_id,sku,internal_notes")
        .or(productMatch(ids, skus)),
    ),
  getSuppliers: async (ids, skus) => {
    const rows = await read<any>(
      getSupabaseClient()
        .from("romiku_product_suppliers")
        .select(
          "id,sanity_product_id,sku,supplier_id,preferred,moq,lead_days,qty_per_carton,length_cm,width_cm,height_cm,carton_weight_kg,romiku_suppliers(name)",
        )
        .or(productMatch(ids, skus)),
    );
    return rows.map(({ romiku_suppliers, ...supplier }) => ({
      ...supplier,
      supplier_name: romiku_suppliers?.name,
    }));
  },
  getCosts: (supplierIds) =>
    read(
      getSupabaseClient()
        .from("romiku_current_reference_cost")
        .select("product_supplier_id,cost,currency")
        .in("product_supplier_id", supplierIds),
    ),
});
