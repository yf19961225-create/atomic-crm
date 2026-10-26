import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCatalogQuery,
  mapCatalogPage,
  type SanityCatalogRecord,
} from "./sanityCatalogSource";

describe("Sanity catalog source", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requests the same-origin catalog API instead of Sanity from the browser", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ result: [] })));
    vi.stubGlobal("fetch", fetchMock);
    const { createSanityCatalogSource } = await import("./sanityCatalogSource");

    await createSanityCatalogSource().getPage({
      search: "收纳",
      includeUnpublished: false,
      after: {
        skuSort: "RMK-100",
        id: "sanity-1",
        rank: 4,
        searchKey: "published:收纳",
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/product-catalog?search=%E6%94%B6%E7%BA%B3&includeUnpublished=false&cursorSku=RMK-100&cursorId=sanity-1&cursorRank=4&cursorSearch=published%3A%E6%94%B6%E7%BA%B3&pageSize=50",
    );
  });

  it("builds a parameterized read-only published catalog query", () => {
    const query = buildCatalogQuery({
      search: "收纳",
      includeUnpublished: false,
    });
    expect(query.query).toContain("isPublished == true");
    expect(query.query).toContain('!(_id in path("drafts.**"))');
    expect(query.query).toContain(
      'order(_catalogRank asc, coalesce(sku, "") asc, _id asc)',
    );
    expect(query.limit).toBe(51);
    expect(query.params.search).toBe("*收纳*");
  });

  it("uses sku then id cursor so duplicate and empty SKUs page exactly once", () => {
    const records: SanityCatalogRecord[] = [
      { _id: "a", sku: null, name: { zh: "空" }, isPublished: true },
      { _id: "b", sku: "A/01 & B", name: { zh: "甲" }, isPublished: true },
      { _id: "c", sku: "A/01 & B", name: { zh: "乙" }, isPublished: true },
    ];
    expect(mapCatalogPage(records, 2)).toMatchObject({
      products: [{ id: "a" }, { id: "b" }],
      nextCursor: { skuSort: "A/01 & B", id: "b" },
    });
  });

  it("walks all 1,801 published products without repeating or skipping cursor identities", () => {
    const records = Array.from({ length: 1801 }, (_, index) => ({
      _id: `id-${String(index).padStart(4, "0")}`,
      sku:
        index % 200 === 0
          ? null
          : index % 99 === 0
            ? "重复/特例 & SKU"
            : `SKU-${String(index).padStart(4, "0")}`,
      isPublished: true,
    })).sort(
      (a, b) =>
        (a.sku ?? "").localeCompare(b.sku ?? "") || a._id.localeCompare(b._id),
    );
    const seen: string[] = [];
    for (let start = 0; start < records.length; start += 50)
      seen.push(
        ...mapCatalogPage(records.slice(start, start + 51)).products.map(
          (product) => product.id,
        ),
      );
    expect(seen).toHaveLength(1801);
    expect(new Set(seen).size).toBe(1801);
  });
});

it.each(["XSUV-704", "XSUV704", "xsuv 704", "xsuv_704"])(
  "canonicalizes query %s at the same boundary as stored SKU",
  (search) => {
    const result = buildCatalogQuery({ search, includeUnpublished: false });
    expect(result.params).toMatchObject({
      canonical: "xsuv704",
      canonicalPartial: "*xsuv704*",
    });
    expect(result.query).toContain("string::split");
    expect(result.query).toContain("array::join");
    expect(result.query).toContain("_catalogRank asc");
    expect(result.limit).toBe(51);
  },
);
