import type { SanityCatalogProduct } from "./sanityCatalogSource";

export type OverlayClient = {
  getExtensions: (ids: string[], skus: string[]) => Promise<Array<{ id: string; sanity_product_id?: string | null; sku: string; internal_notes?: string | null }>>;
  getSuppliers: (ids: string[], skus: string[]) => Promise<Array<{ id: string; sanity_product_id?: string | null; sku: string; supplier_id: string; supplier_name?: string; preferred: boolean; moq?: number | null; lead_days?: number | null }>>;
  getCosts: (supplierIds: string[]) => Promise<Array<{ product_supplier_id: string; cost: number; currency: string }>>;
};
export type ProductOverlay = { internalNotes?: string | null; supplierCount: number; preferredSupplier?: string; supplierMoq?: number | null; leadDays?: number | null; referenceCost?: { cost: number; currency: string }; unavailable?: boolean };
export const unavailableOverlay = (products: SanityCatalogProduct[]) => new Map(products.map((product) => [product.id, { supplierCount: 0, unavailable: true } satisfies ProductOverlay]));
export const loadProductProcurementOverlay = async (products: SanityCatalogProduct[], client: OverlayClient) => {
  const ids = products.map((product) => product.id);
  const skus = products.flatMap((product) => (product.sku ? [product.sku] : []));
  const [extensions, suppliers] = await Promise.all([client.getExtensions(ids, skus), client.getSuppliers(ids, skus)]);
  const costs = await client.getCosts(suppliers.map((supplier) => supplier.id));
  const result = new Map<string, ProductOverlay>();
  for (const product of products) {
    const extension = extensions.find((row) => row.sanity_product_id === product.id || (!row.sanity_product_id && row.sku === product.sku));
    const matched = suppliers.filter((row) => row.sanity_product_id === product.id || (!row.sanity_product_id && row.sku === product.sku));
    const preferred = matched.find((row) => row.preferred);
    const cost = costs.find((row) => row.product_supplier_id === preferred?.id) ?? costs.find((row) => matched.some((supplier) => supplier.id === row.product_supplier_id));
    result.set(product.id, { internalNotes: extension?.internal_notes, supplierCount: matched.length, preferredSupplier: preferred?.supplier_name, supplierMoq: preferred?.moq, leadDays: preferred?.lead_days, referenceCost: cost && { cost: cost.cost, currency: cost.currency } });
  }
  return result;
};
