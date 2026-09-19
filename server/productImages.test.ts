import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import endpoint from "../api/product-images";

const request = (path = "") =>
  new Request(`https://crm.example.test/api/product-images${path}`);

const indexSource =
  'window.ROMIKU_PRODUCT_INDEX = {"chunks":{"accessories":"products-accessories.js","tools":"products-tools.js"},"productChunks":{"005":"accessories","006":"accessories","009":"accessories","010":"accessories","T1":"tools"}};';
const accessoriesSource =
  'window.ROMIKU_PRODUCTS = Object.assign(window.ROMIKU_PRODUCTS || {}, {"005":{"sku":"005","image":"./images/products-local/005_main1.jpg","images":["./images/products-local/005_main2.jpg"]},"006":{"sku":"006","images":["./images/products-local/006_main1.jpg"]},"009":{"sku":"009","images":[]},"010":{"sku":"010","image":""}});';
const toolsSource =
  'window.ROMIKU_PRODUCTS = Object.assign(window.ROMIKU_PRODUCTS || {}, {"T1":{"sku":"T1","image":"./images/products-local/T1_main.jpg"}});';

describe("product image API", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("resolves official images in batches, preferring image then images[]", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("products-index.js")) return new Response(indexSource);
      if (url.includes("products-accessories.js"))
        return new Response(accessoriesSource);
      if (url.includes("products-tools.js")) return new Response(toolsSource);
      throw new Error(`unexpected URL ${url}`);
    });

    const response = await endpoint.fetch(request("?skus=005,006,009,010,T1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      images: {
        "005": "https://romiku.com/images/products-local/005_main1.jpg",
        "006": "https://romiku.com/images/products-local/006_main1.jpg",
        T1: "https://romiku.com/images/products-local/T1_main.jpg",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toContain("products-accessories.js");
    expect(fetchMock.mock.calls[2][0]).toContain("products-tools.js");
  });

  it("rejects non-GET and invalid SKU input without fetching", async () => {
    expect(
      (await endpoint.fetch(new Request(request().url, { method: "POST" })))
        .status,
    ).toBe(405);
    expect((await endpoint.fetch(request("?skus=005,,006"))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
