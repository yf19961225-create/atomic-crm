import {
  buildCatalogQuery,
  catalogPageSize,
  catalogSearchKey,
  type CatalogFilter,
} from "../../../../shared/productCatalogQuery";
export { buildCatalogQuery, catalogPageSize };
export type { CatalogFilter };
export type SanityCatalogCategory = {
  _id?: string;
  title?: Record<string, string>;
  slug?: { current?: string };
  parent?: SanityCatalogCategory;
};
export type SanityCatalogRecord = {
  _id: string;
  _catalogRank?: number;
  sku?: string | null;
  name?: Record<string, string>;
  images?: Array<{ url?: string }>;
  category?: SanityCatalogCategory;
  parameters?: Array<{ label?: Record<string, string>; value?: unknown }>;
  moqQuantity?: number;
  moqUnit?: Record<string, string>;
  packaging?: Record<string, string>;
  cartonQty?: number | string;
  powerSupply?: Record<string, string> | null;
  isPublished?: boolean;
};
export type SanityCatalogProduct = Omit<SanityCatalogRecord, "_id"> & {
  id: string;
  skuSort: string;
  isPublished: boolean;
};
const map = (record: SanityCatalogRecord): SanityCatalogProduct => ({
  ...record,
  id: record._id,
  skuSort: record.sku ?? "",
  isPublished: record.isPublished === true,
});
export const mapCatalogPage = (
  records: SanityCatalogRecord[],
  size = catalogPageSize,
  filter: Pick<CatalogFilter, "search" | "includeUnpublished"> = {
    search: "",
    includeUnpublished: false,
  },
) => {
  const products = records.slice(0, size).map(map);
  const last = products.at(-1);
  return {
    products,
    nextCursor:
      records.length > size && last
        ? {
            skuSort: last.skuSort,
            id: last.id,
            rank: last._catalogRank ?? 0,
            searchKey: catalogSearchKey(
              filter.search,
              filter.includeUnpublished,
            ),
          }
        : undefined,
  };
};

export const createSanityCatalogSource = () => ({
  async getPage(filter: CatalogFilter) {
    const params = new URLSearchParams({
      search: filter.search,
      includeUnpublished: String(filter.includeUnpublished),
      ...(filter.after
        ? {
            cursorSku: filter.after.skuSort,
            cursorId: filter.after.id,
            cursorRank: String(filter.after.rank),
            cursorSearch: filter.after.searchKey,
          }
        : {}),
      pageSize: String(catalogPageSize),
    });
    const response = await fetch(`/api/product-catalog?${params}`);
    if (!response.ok)
      throw new Error(`Sanity catalog request failed: ${response.status}`);
    const body = (await response.json()) as { result?: SanityCatalogRecord[] };
    return mapCatalogPage(body.result ?? [], catalogPageSize, filter);
  },
});
