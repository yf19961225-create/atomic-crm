import {
  buildCatalogQuery,
  catalogPageSize,
  catalogSearchKey,
  type CatalogFilter,
} from "../shared/productCatalogQuery.js";
const maxSearchLength = 200;
const maxCursorLength = 500;
const sanityCatalogEndpoint =
  "https://gxuvcyaa.api.sanity.io/v2025-07-05/data/query/production";
const reject = (status: number, error: string, headers?: HeadersInit) =>
  Response.json(
    { error },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );

const one = (params: URLSearchParams, key: string) => {
  const values = params.getAll(key);
  return values.length > 1 ? null : (values[0] ?? "");
};

const parseFilter = (url: URL): CatalogFilter | null => {
  const search = one(url.searchParams, "search");
  const includeUnpublished = one(url.searchParams, "includeUnpublished");
  const cursorSku = one(url.searchParams, "cursorSku");
  const cursorId = one(url.searchParams, "cursorId");
  const cursorRank = one(url.searchParams, "cursorRank");
  const cursorSearch = one(url.searchParams, "cursorSearch");
  const hasCursor = [
    "cursorSku",
    "cursorId",
    "cursorRank",
    "cursorSearch",
  ].some((key) => url.searchParams.has(key));
  const pageSize = one(url.searchParams, "pageSize");
  if (
    cursorRank === null ||
    cursorSearch === null ||
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
    (hasCursor &&
      (!url.searchParams.has("cursorSku") ||
        !cursorId ||
        !/^[0-4]$/.test(cursorRank) ||
        cursorSearch !==
          catalogSearchKey(search, includeUnpublished === "true")))
  ) {
    return null;
  }
  return {
    search,
    includeUnpublished: includeUnpublished === "true",
    ...(hasCursor
      ? {
          after: {
            skuSort: cursorSku,
            id: cursorId,
            rank: Number(cursorRank),
            searchKey: cursorSearch,
          },
        }
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
      ...Object.fromEntries(
        Object.entries(catalog.params).map(([key, value]) => [
          `$${key}`,
          JSON.stringify(value),
        ]),
      ),
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
