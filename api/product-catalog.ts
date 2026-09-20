const maxSearchLength = 200;
const maxCursorLength = 500;
const catalogPageSize = 50;
const sanityCatalogEndpoint =
  "https://gxuvcyaa.api.sanity.io/v2025-07-05/data/query/production";
type CatalogFilter = {
  search: string;
  includeUnpublished: boolean;
  after?: { skuSort: string; id: string };
};

const reject = (status: number, error: string, headers?: HeadersInit) =>
  Response.json(
    { error },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );

const one = (params: URLSearchParams, key: string) => {
  const values = params.getAll(key);
  return values.length > 1 ? null : (values[0] ?? "");
};

const buildCatalogQuery = (filter: CatalogFilter) => {
  const after = filter.after
    ? ' && (coalesce(sku, "") > $afterSku || (coalesce(sku, "") == $afterSku && _id > $afterId))'
    : "";
  const published = filter.includeUnpublished ? "" : " && isPublished == true";
  return {
    query: `*[_type == "product" && !(_id in path("drafts.**"))${published}${after} && (sku match $search || name.zh match $search || name.en match $search || name.es match $search || category->title.zh match $search || category->title.en match $search || category->title.es match $search)] | order(coalesce(sku, "") asc, _id asc)[0...$limit]{_id,sku,name,images[]{url},category->{_id,title,slug},parameters[]{label,value},moqQuantity,moqUnit,packaging,cartonQty,powerSupply,isPublished}`,
    search: `*${filter.search}*`,
    afterSku: filter.after?.skuSort ?? "",
    afterId: filter.after?.id ?? "",
    limit: catalogPageSize + 1,
  };
};

const parseFilter = (url: URL): CatalogFilter | null => {
  const search = one(url.searchParams, "search");
  const includeUnpublished = one(url.searchParams, "includeUnpublished");
  const cursorSku = one(url.searchParams, "cursorSku");
  const cursorId = one(url.searchParams, "cursorId");
  const pageSize = one(url.searchParams, "pageSize");
  if (
    search === null ||
    includeUnpublished === null ||
    cursorSku === null ||
    cursorId === null ||
    pageSize === null ||
    search.length > maxSearchLength ||
    cursorSku.length > maxCursorLength ||
    cursorId.length > maxCursorLength ||
    (includeUnpublished !== "" &&
      includeUnpublished !== "true" &&
      includeUnpublished !== "false") ||
    (pageSize !== "" && pageSize !== String(catalogPageSize)) ||
    Boolean(cursorSku) !== Boolean(cursorId)
  ) {
    return null;
  }
  return {
    search,
    includeUnpublished: includeUnpublished === "true",
    ...(cursorSku && cursorId
      ? { after: { skuSort: cursorSku, id: cursorId } }
      : {}),
  };
};

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET")
      return reject(405, "method_not_allowed", { Allow: "GET" });
    const filter = parseFilter(new URL(request.url));
    if (!filter) return reject(400, "invalid_catalog_parameters");

    const catalog = buildCatalogQuery(filter);
    const params = new URLSearchParams({
      query: catalog.query,
      $search: JSON.stringify(catalog.search),
      $afterSku: JSON.stringify(catalog.afterSku),
      $afterId: JSON.stringify(catalog.afterId),
      $limit: String(catalog.limit),
    });
    try {
      const response = await fetch(`${sanityCatalogEndpoint}?${params}`, {
        method: "GET",
      });
      if (!response.ok) return reject(502, "catalog_upstream_unavailable");
      const body = (await response.json()) as { result?: unknown };
      if (!Array.isArray(body.result))
        return reject(502, "catalog_upstream_unavailable");
      return Response.json({ result: body.result });
    } catch {
      return reject(502, "catalog_upstream_unavailable");
    }
  },
};
