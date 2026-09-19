export type DrawerProduct = { id: string; sku?: string | null };
export type SupplierValues = {
  id?: string;
  supplier_id: string;
  preferred?: boolean;
  supplier_item_number?: string;
  moq?: number | null;
  lead_days?: number | null;
};
export type CostValues = {
  cost: number;
  currency: string;
  effective_date: string;
  source_type: string;
};
export type DrawerExtension = { id: string; internal_notes?: string | null };
export type DrawerSupplier = {
  id: string;
  supplier_id: string;
  supplier_name?: string | null;
  preferred?: boolean;
  supplier_item_number?: string | null;
  moq?: number | null;
  lead_days?: number | null;
};
export type DrawerCost = {
  id: string;
  product_supplier_id: string;
  cost: number;
  currency: string;
  effective_date: string;
  source_type: string;
};
export type SupplierOption = { id: string; name: string };
export type ProductDrawerClient = {
  createExtension: (value: {
    sku: string;
    sanity_product_id: string;
    internal_notes: string | null;
  }) => Promise<unknown>;
  updateExtension: (
    id: string,
    value: { internal_notes: string | null },
  ) => Promise<unknown>;
  createSupplier: (
    value: SupplierValues & { sku: string; sanity_product_id: string },
  ) => Promise<unknown>;
  updateSupplier: (
    id: string,
    value: SupplierValues & { sku: string; sanity_product_id: string },
  ) => Promise<unknown>;
  createCost: (
    value: CostValues & { product_supplier_id: string },
  ) => Promise<unknown>;
};
export type ProductDrawerReadClient = {
  getExtension: (product: DrawerProduct) => Promise<DrawerExtension | null>;
  getSuppliers: (product: DrawerProduct) => Promise<DrawerSupplier[]>;
  getCosts: (productSupplierIds: string[]) => Promise<DrawerCost[]>;
  getSupplierOptions: () => Promise<SupplierOption[]>;
};
export const saveInternalNotes = async (
  client: ProductDrawerClient,
  product: DrawerProduct,
  extensionId: string | undefined,
  internalNotes: string,
  refresh: (products: DrawerProduct[]) => Promise<unknown> | unknown,
) => {
  if (!product.sku) throw new Error("Sanity product SKU is required");
  if (extensionId)
    await client.updateExtension(extensionId, {
      internal_notes: internalNotes || null,
    });
  else
    await client.createExtension({
      sku: product.sku,
      sanity_product_id: product.id,
      internal_notes: internalNotes || null,
    });
  await refresh([product]);
};
export const saveSupplier = async (
  client: ProductDrawerClient,
  product: DrawerProduct,
  values: SupplierValues,
  refresh: (products: DrawerProduct[]) => Promise<unknown> | unknown,
) => {
  if (!product.sku) throw new Error("Sanity product SKU is required");
  const write = { ...values, sku: product.sku, sanity_product_id: product.id };
  if (values.id) await client.updateSupplier(values.id, write);
  else await client.createSupplier(write);
  await refresh([product]);
};
export const addCostHistory = (
  client: ProductDrawerClient,
  productSupplierId: string,
  values: CostValues,
) =>
  client.createCost({
    ...values,
    currency: values.currency.trim().toUpperCase(),
    product_supplier_id: productSupplierId,
  });
