export type SanityCatalogCategory = {
  _id?: string;
  title?: Record<string, string>;
  slug?: { current?: string };
  parent?: SanityCatalogCategory;
};
export type SanityCatalogRecord = {
  _id: string;
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
export type CatalogFilter = {
  search: string;
  includeUnpublished: boolean;
  after?: { skuSort: string; id: string };
};
export const catalogPageSize = 50;

export const buildCatalogQuery = (filter: CatalogFilter) => {
  const after = filter.after
    ? ' && (coalesce(sku, "") > $afterSku || (coalesce(sku, "") == $afterSku && _id > $afterId))'
    : "";
  const published = filter.includeUnpublished ? "" : " && isPublished == true";
  return {
    query: `*[_type == "product" && !(_id in path("drafts.**"))${published}${after} && (sku match $search || name.zh match $search || name.en match $search || name.es match $search || category->title.zh match $search || category->title.en match $search || category->title.es match $search)] | order(coalesce(sku, "") asc, _id asc)[0...$limit]{_id,sku,name,images[]{url},category->{_id,title,slug,parent->{_id,title,slug,parent->{_id,title,slug}}},parameters[]{label,value},moqQuantity,moqUnit,packaging,cartonQty,powerSupply,isPublished}`,
    params: {
      search: `*${filter.search}*`,
      afterSku: filter.after?.skuSort ?? "",
      afterId: filter.after?.id ?? "",
    },
    limit: catalogPageSize + 1,
  };
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
) => {
  const products = records.slice(0, size).map(map);
  const last = products.at(-1);
  return {
    products,
    nextCursor:
      records.length > size && last
        ? { skuSort: last.skuSort, id: last.id }
        : undefined,
  };
};

export const createSanityCatalogSource = () => ({
  async getPage(filter: CatalogFilter) {
    const params = new URLSearchParams({
      search: filter.search,
      includeUnpublished: String(filter.includeUnpublished),
      ...(filter.after
        ? { cursorSku: filter.after.skuSort, cursorId: filter.after.id }
        : {}),
      pageSize: String(catalogPageSize),
    });
    const response = await fetch(`/api/product-catalog?${params}`);
    if (!response.ok)
      throw new Error(`Sanity catalog request failed: ${response.status}`);
    const body = (await response.json()) as { result?: SanityCatalogRecord[] };
    return mapCatalogPage(body.result ?? []);
  },
});
