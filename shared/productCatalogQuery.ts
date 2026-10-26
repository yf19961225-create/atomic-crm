/** Public read-only Sanity query contract, shared by the API and browser mapper. */
export type CatalogCursor = {
  skuSort: string;
  id: string;
  rank: number;
  searchKey: string;
};
export type CatalogFilter = {
  search: string;
  includeUnpublished: boolean;
  after?: CatalogCursor;
};
export const catalogPageSize = 50;
export const catalogSearchKey = (search: string, includeUnpublished: boolean) =>
  `${includeUnpublished ? "all" : "published"}:${search.trim().toLowerCase()}`;
// Deliberately identical normalization on both sides of the query boundary.
const separators = ["-", "_", " ", "\t", "\r", "\n", "\u00a0", "\u3000"];
export const canonicalSkuSearch = (value: string) =>
  separators.reduce(
    (text, separator) => text.split(separator).join(""),
    value.toLowerCase(),
  );
const canonicalSku = separators.reduce(
  (expression, separator) =>
    `array::join(string::split(${expression}, ${JSON.stringify(separator)}), "")`,
  'lower(coalesce(sku, ""))',
);

export function buildCatalogQuery(filter: CatalogFilter) {
  const raw = filter.search.trim().toLowerCase();
  const canonical = canonicalSkuSearch(raw);
  const searchKey = catalogSearchKey(filter.search, filter.includeUnpublished);
  if (
    filter.after &&
    (filter.after.searchKey !== searchKey ||
      !Number.isInteger(filter.after.rank) ||
      filter.after.rank < 0 ||
      filter.after.rank > 4)
  )
    throw new Error("Invalid catalog cursor");
  const after = filter.after
    ? `[_catalogRank > $afterRank || (_catalogRank == $afterRank && (coalesce(sku, "") > $afterSku || (coalesce(sku, "") == $afterSku && _id > $afterId)))]`
    : "";
  return {
    query: `*[_type == "product" && !(_id in path("drafts.**"))${filter.includeUnpublished ? "" : " && isPublished == true"}]{..., "_canonicalSku": ${canonicalSku}}{
      ..., "_catalogRank": select(
        $raw == "" || lower(coalesce(sku, "")) == $raw => 0,
        $canonical != "" && _canonicalSku == $canonical => 1,
        $canonical != "" && string::startsWith(_canonicalSku, $canonical) => 2,
        $canonical != "" && _canonicalSku match $canonicalPartial => 3,
        name.zh match $search || name.en match $search || name.es match $search || category->title.zh match $search || category->title.en match $search || category->title.es match $search => 4,
        5)
    }[_catalogRank < 5]${after} | order(_catalogRank asc, coalesce(sku, "") asc, _id asc)[0...$limit]{_id,sku,name,_catalogRank,images[]{url},category->{_id,title,slug,parent->{_id,title,slug,parent->{_id,title,slug}}},parameters[]{label,value},moqQuantity,moqUnit,packaging,cartonQty,powerSupply,isPublished}`,
    params: {
      search: `*${raw}*`,
      raw,
      canonical,
      canonicalPartial: `*${canonical}*`,
      afterRank: filter.after?.rank ?? 0,
      afterSku: filter.after?.skuSort ?? "",
      afterId: filter.after?.id ?? "",
    },
    limit: catalogPageSize + 1,
  };
}
