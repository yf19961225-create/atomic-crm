export type ProductExtensionWrite = {
  sku: string;
  sanity_product_id?: string | null;
  _sanity_verified?: boolean;
  _sanity_verified_sku?: string;
  internal_notes?: string | null;
};

export type ProductSupplierWrite = {
  sanity_product_id?: string | null;
  sku: string;
  supplier_id: string;
  supplier_item_number?: string | null;
  moq?: number | null;
  lead_days?: number | null;
  qty_per_carton?: number | null;
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  carton_weight_kg?: number | null;
  preferred?: boolean;
  active?: boolean;
  reference_date?: string | null;
  notes?: string | null;
};

export type ProcurementCostWrite = {
  product_supplier_id: string;
  cost: number;
  currency: string;
  effective_date: string;
  source_type: string;
  source_note?: string | null;
};

export const isProductSupplierDuplicateError = (error: unknown) => {
  const value = error as { code?: string; message?: string };
  return (
    value?.code === "23505" ||
    value?.message?.includes("sku,supplier_id") === true
  );
};

/** Selects only the columns owned by the CRM extension table. */
export const toProductExtensionWrite = (
  values: ProductExtensionWrite,
): ProductExtensionWrite => ({
  sku: values.sku,
  ...(values._sanity_verified &&
  values._sanity_verified_sku === values.sku &&
  values.sanity_product_id
    ? { sanity_product_id: values.sanity_product_id }
    : {}),
  internal_notes: values.internal_notes || null,
});

/** Selects the join-record columns; it never materializes a product master. */
export const toProductSupplierWrite = (
  values: ProductSupplierWrite,
): ProductSupplierWrite => ({
  sku: values.sku,
  supplier_id: values.supplier_id,
  supplier_item_number: values.supplier_item_number || null,
  moq: values.moq ?? null,
  lead_days: values.lead_days ?? null,
  qty_per_carton: values.qty_per_carton ?? null,
  length_cm: values.length_cm ?? null,
  width_cm: values.width_cm ?? null,
  height_cm: values.height_cm ?? null,
  carton_weight_kg: values.carton_weight_kg ?? null,
  preferred: values.preferred ?? false,
  active: values.active ?? true,
  reference_date: values.reference_date || null,
  notes: values.notes || null,
});

/** Selects only the append-only reference-cost columns. */
export const toProcurementCostWrite = (
  values: ProcurementCostWrite,
): ProcurementCostWrite => ({
  product_supplier_id: values.product_supplier_id,
  cost: values.cost,
  currency: values.currency.trim().toUpperCase(),
  effective_date: values.effective_date,
  source_type: values.source_type,
  source_note: values.source_note || null,
});
