import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import endpoint from "../api/product-catalog";

const request = (path = "") =>
  new Request(`https://crm.example.test/api/product-catalog${path}`);

describe("product catalog API", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("returns the fixed public Sanity catalog query result", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ result: [{ _id: "sanity-1", sku: "RMK-100" }] }),
    );

    const response = await endpoint.fetch(
      request(
        "?search=%E6%94%B6%E7%BA%B3&includeUnpublished=false&pageSize=50",
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      result: [{ _id: "sanity-1", sku: "RMK-100" }],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(
      "https://gxuvcyaa.api.sanity.io/v2025-07-05/data/query/production?",
    );
    expect(options).toEqual({ method: "GET" });
    const params = new URL(url).searchParams;
    expect(params.get("$search")).toBe('"*收纳*"');
    expect(params.get("$limit")).toBe("51");
  });

  it("rejects every non-GET request before it reaches Sanity", async () => {
    const response = await endpoint.fetch(
      new Request("https://crm.example.test/api/product-catalog", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not accept a client supplied GROQ query", async () => {
    fetchMock.mockResolvedValue(Response.json({ result: [] }));

    const response = await endpoint.fetch(
      request("?query=*%5B_type%3D%3D%27secret%27%5D&pageSize=50"),
    );

    expect(response.status).toBe(200);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).not.toContain("secret");
    expect(new URL(url).searchParams.get("query")).toContain(
      '_type == "product"',
    );
  });

  it("validates cursor pairs and the fixed page size", async () => {
    const cursorOnly = await endpoint.fetch(request("?cursorSku=RMK-100"));
    const invalidSize = await endpoint.fetch(request("?pageSize=100"));

    expect(cursorOnly.status).toBe(400);
    expect(invalidSize.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
