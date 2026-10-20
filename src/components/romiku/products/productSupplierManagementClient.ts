import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";

type RpcResponse = {
  data: unknown;
  error: { message: string } | null;
};
export type RpcTransport = (
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<RpcResponse>;

type RpcResult = {
  ok: boolean;
  code?: string;
  message?: string;
  relationId?: string;
  sourceRelationId?: string;
  targetRelationId?: string;
  reactivated?: boolean;
  selectedProductCount?: number;
  validProductCount?: number;
  supplierCount?: number;
  newCount?: number;
  reactivateCount?: number;
  skipCount?: number;
  invalidSkus?: string[];
  preferredChangeCount?: number;
  planToken?: string;
  costHistoryCount?: number;
};

export class ProductSupplierActionError extends Error {
  constructor(
    readonly code: string,
    message?: string,
    readonly costHistoryCount?: number,
  ) {
    super(message ?? code);
  }
}

export type ProcurementEdit = {
  relationId: string;
  supplierItemNumber: string | null;
  moq: number | null;
  leadDays: number | null;
  preferred: boolean;
  qtyPerCarton?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  cartonWeightKg?: number | null;
  referenceDate?: string | null;
  notes?: string | null;
};

export type BulkProduct = { sku: string; sanity_product_id: string };

const defaultTransport: RpcTransport = (name, args) =>
  getSupabaseClient().rpc(name, args);

export const createProductSupplierManagementClient = (
  rpc: RpcTransport = defaultTransport,
) => {
  const call = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await rpc(name, args);
    if (error) throw new ProductSupplierActionError("NETWORK_ERROR", error.message);
    const result = data as RpcResult | null;
    if (!result || result.ok !== true)
      throw new ProductSupplierActionError(
        result?.code ?? "UNKNOWN_ERROR",
        result?.message,
        result?.costHistoryCount,
      );
    return result;
  };
  return {
    save: (value: ProcurementEdit) =>
      call("romiku_save_product_supplier", {
        relation_id: value.relationId,
        supplier_item_number: value.supplierItemNumber,
        moq: value.moq,
        lead_days: value.leadDays,
        preferred: value.preferred,
        qty_per_carton: value.qtyPerCarton ?? null,
        length_cm: value.lengthCm ?? null,
        width_cm: value.widthCm ?? null,
        height_cm: value.heightCm ?? null,
        carton_weight_kg: value.cartonWeightKg ?? null,
        reference_date: value.referenceDate ?? null,
        notes: value.notes ?? null,
      }),
    replace: (sourceRelationId: string, targetSupplierId: string, preferred: boolean) =>
      call("romiku_replace_product_supplier", {
        source_relation_id: sourceRelationId,
        target_supplier_id: targetSupplierId,
        make_preferred: preferred,
      }),
    remove: (relationId: string) =>
      call("romiku_delete_product_supplier", { relation_id: relationId }),
    previewBulk: (products: BulkProduct[], supplierIds: string[], preferredId: string | null) =>
      call("romiku_preview_bulk_product_suppliers", {
        products,
        supplier_ids: supplierIds,
        preferred_supplier_id: preferredId,
      }),
    applyBulk: (
      products: BulkProduct[],
      supplierIds: string[],
      preferredId: string | null,
      planToken: string,
    ) =>
      call("romiku_apply_bulk_product_suppliers", {
        products,
        supplier_ids: supplierIds,
        preferred_supplier_id: preferredId,
        expected_plan_token: planToken,
      }),
  };
};

export type ProductSupplierManagementClient = ReturnType<
  typeof createProductSupplierManagementClient
>;
