import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import type {
  DrawerProduct,
  ProductDrawerClient,
  ProductDrawerReadClient,
} from "./productDrawerActions";

const write = async (
  request: PromiseLike<{ error: { message: string } | null }>,
) => {
  const { error } = await request;
  if (error) throw new Error(error.message);
};

const read = async <T>(
  request: PromiseLike<{ data: T; error: { message: string } | null }>,
) => {
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return data;
};

const productFilter = (product: DrawerProduct) =>
  product.sku
    ? `sanity_product_id.eq.${product.id},sku.eq.${product.sku}`
    : `sanity_product_id.eq.${product.id}`;

export const createSupabaseProductDrawerClient = (): ProductDrawerClient &
  ProductDrawerReadClient => ({
  createExtension: async (value) => {
    await write(
      getSupabaseClient().from("romiku_product_extensions").insert(value),
    );
  },
  updateExtension: async (id, value) => {
    await write(
      getSupabaseClient()
        .from("romiku_product_extensions")
        .update(value)
        .eq("id", id),
    );
  },
  createSupplier: async (value) => {
    await write(
      getSupabaseClient().from("romiku_product_suppliers").insert(value),
    );
  },
  updateSupplier: async (id, value) => {
    await write(
      getSupabaseClient()
        .from("romiku_product_suppliers")
        .update(value)
        .eq("id", id),
    );
  },
  createCost: async (value) => {
    await write(
      getSupabaseClient().from("romiku_procurement_cost_history").insert(value),
    );
  },
  getExtension: async (product) =>
    read(
      getSupabaseClient()
        .from("romiku_product_extensions")
        .select("id,internal_notes")
        .or(productFilter(product))
        .maybeSingle(),
    ),
  getSuppliers: async (product) =>
    read(
      getSupabaseClient()
        .from("romiku_product_suppliers")
        .select(
          "id,supplier_id,supplier_item_number,moq,lead_days,preferred,romiku_suppliers(name)",
        )
        .or(productFilter(product)),
    ).then((rows) =>
      (rows ?? []).map((row) => ({
        ...row,
        supplier_name: row.romiku_suppliers?.[0]?.name ?? null,
      })),
    ),
  getCosts: async (productSupplierIds) => {
    if (!productSupplierIds.length) return [];
    return read(
      getSupabaseClient()
        .from("romiku_procurement_cost_history")
        .select(
          "id,product_supplier_id,cost,currency,effective_date,source_type",
        )
        .in("product_supplier_id", productSupplierIds)
        .order("effective_date", { ascending: false }),
    ).then((rows) => rows ?? []);
  },
  getSupplierOptions: async () =>
    read(
      getSupabaseClient()
        .from("romiku_suppliers")
        .select("id,name")
        .order("name", { ascending: true }),
    ).then((rows) => rows ?? []),
});
