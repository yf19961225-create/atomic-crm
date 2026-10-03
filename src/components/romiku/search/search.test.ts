import { expect, it, vi } from "vitest";
import {
  hydrateSearchPage,
  matchedFieldLabel,
  searchBusinessRecords,
  type SearchGroup,
} from "./search";

it("passes exact RPC arguments and keeps grouped count and rank order", async () => {
  const rpc = vi.fn().mockResolvedValue({
    data: {
      groups: [
        {
          resource_type: "quote",
          total_count: 27,
          limit: 25,
          offset: 25,
          has_more: false,
          items: [
            { id: "b", title: "B", subtitle: "", matched_fields: [], rank: 0 },
            { id: "a", title: "A", subtitle: "", matched_fields: [], rank: 1 },
          ],
        },
      ],
    },
    error: null,
  });
  const result = await searchBusinessRecords(rpc, {
    query: " ABC ",
    resource_types: ["quote"],
    limit: 25,
    offset: 25,
    filters: { status: "draft" },
  });
  expect(rpc).toHaveBeenCalledWith("romiku_global_search", {
    query: "ABC",
    resource_types: ["quote"],
    limit: 25,
    offset: 25,
    filters: { status: "draft" },
  });
  expect(result.groups[0]).toMatchObject({
    total_count: 27,
    has_more: false,
    items: [{ id: "b" }, { id: "a" }],
  });
});

it("hydrates only page IDs in one request and restores RPC rank order", async () => {
  const group = {
    resource_type: "quote",
    total_count: 2,
    limit: 25,
    offset: 0,
    has_more: false,
    items: [
      { id: "b", title: "B", subtitle: "", matched_fields: [], rank: 0 },
      { id: "a", title: "A", subtitle: "", matched_fields: [], rank: 1 },
    ],
  } as SearchGroup;
  const getMany = vi.fn().mockResolvedValue({
    data: [
      { id: "a", document_number: "A" },
      { id: "b", document_number: "B" },
    ],
  });
  const result = await hydrateSearchPage(getMany, "romiku_quote_totals", group);
  expect(getMany).toHaveBeenCalledOnce();
  expect(getMany).toHaveBeenCalledWith("romiku_quote_totals", {
    ids: ["b", "a"],
  });
  expect(result.map((row) => row.id)).toEqual(["b", "a"]);
});

it("omits a deleted ID when a totals view no longer returns it", async () => {
  const group = {
    resource_type: "quote",
    total_count: 1,
    limit: 25,
    offset: 0,
    has_more: false,
    items: [
      { id: "x", title: "X", subtitle: "", matched_fields: ["SKU"], rank: 0 },
    ],
  } as SearchGroup;
  const result = await hydrateSearchPage(
    vi.fn().mockResolvedValue({ data: [] }),
    "romiku_quote_totals",
    group,
  );
  expect(result).toEqual([]);
});

it("shows business labels for matched fields without exposing internal field names", () => {
  expect(matchedFieldLabel("item_sku")).toBe("产品 SKU");
  expect(matchedFieldLabel("counterparty_email")).toBe("联系方式");
  expect(matchedFieldLabel("unknown_internal_column")).toBe("业务信息");
});

it("distinguishes linked source matches from the document's own saved buyer", () => {
  expect(matchedFieldLabel("source_customer.name")).toBe("来源信息");
  expect(matchedFieldLabel("source_order.counterparty_snapshot.phone")).toBe(
    "来源信息",
  );
  expect(matchedFieldLabel("source_quote.document_number")).toBe("来源信息");
  expect(matchedFieldLabel("counterparty_snapshot.phone")).toBe("联系方式");
});
