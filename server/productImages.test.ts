import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ProductImageEndpoint = {
  fetch(request: Request): Promise<Response>;
};

const request = (path = "") =>
  new Request(`https://crm.example.test/api/product-images${path}`);

const indexSource =
  'window.ROMIKU_PRODUCT_INDEX = {"chunks":{"accessories":"products-accessories.js","tools":"products-tools.js"},"productChunks":{"005":"accessories","006":"accessories","009":"accessories","010":"accessories","T1":"tools"}};';
const accessoriesSource =
  'window.ROMIKU_PRODUCTS = Object.assign(window.ROMIKU_PRODUCTS || {}, {"005":{"sku":"005","image":"./images/products-local/005_main1.jpg","images":["./images/products-local/005_main2.jpg"]},"006":{"sku":"006","images":["./images/products-local/006_main1.jpg"]},"009":{"sku":"009","images":[]},"010":{"sku":"010","image":""}});';
const toolsSource =
  'window.ROMIKU_PRODUCTS = Object.assign(window.ROMIKU_PRODUCTS || {}, {"T1":{"sku":"T1","image":"./images/products-local/T1_main.jpg"}});';
const caseInsensitiveIndexSource =
  'window.ROMIKU_PRODUCT_INDEX = {"chunks":{"tools":"products-tools.js"},"productChunks":{"rk1":"tools"}};';
const caseInsensitiveToolsSource =
  'window.ROMIKU_PRODUCTS = Object.assign(window.ROMIKU_PRODUCTS || {}, {"rk1":{"sku":"RK1","image":"./images/products-local/RK1_main.jpg"}});';
const hashSkuIndexSource =
  'window.ROMIKU_PRODUCT_INDEX = {"chunks":{"brushes":"products-brushes.js"},"productChunks":{"ab144-10":"brushes","ab144-12":"brushes","ab144-2":"brushes","ab145-10":"brushes"}};';
const hashSkuBrushesSource =
  'window.ROMIKU_PRODUCTS = Object.assign(window.ROMIKU_PRODUCTS || {}, {"ab144-10":{"sku":"AB144-10#","image":"./images/products-local/ab144-10-hash.jpg"},"ab144-12":{"sku":"AB144-12#","images":["./images/products-local/ab144-12-hash.jpg"]},"ab144-2":{"sku":"AB144-2#","image":"./images/products-local/ab144-2-hash.jpg"},"ab145-10":{"sku":"AB145-10#","image":"./images/products-local/ab145-10-hash.jpg"}});';

describe("product image API", () => {
  const fetchMock = vi.fn();
  let endpoint: ProductImageEndpoint;

  beforeEach(async () => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    endpoint = (await import("../api/product-images")).default;
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
      powerSupplies: {},
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

  it("matches website image keys without changing the requested SKU casing", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("products-index.js"))
        return new Response(caseInsensitiveIndexSource);
      if (url.includes("products-tools.js"))
        return new Response(caseInsensitiveToolsSource);
      throw new Error(`unexpected URL ${url}`);
    });

    const response = await endpoint.fetch(request("?skus=RK1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      images: { RK1: "https://romiku.com/images/products-local/RK1_main.jpg" },
      powerSupplies: {},
    });
  });

  it("uses a trailing-hash-normalized lookup key while retaining original SKU response keys", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("products-index.js"))
        return new Response(hashSkuIndexSource);
      if (url.includes("products-brushes.js"))
        return new Response(hashSkuBrushesSource);
      throw new Error(`unexpected URL ${url}`);
    });

    const response = await endpoint.fetch(
      request("?skus=AB144-10%23,AB144-12%23,AB144-2%23,AB145-10%23"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      images: {
        "AB144-10#":
          "https://romiku.com/images/products-local/ab144-10-hash.jpg",
        "AB144-12#":
          "https://romiku.com/images/products-local/ab144-12-hash.jpg",
        "AB144-2#": "https://romiku.com/images/products-local/ab144-2-hash.jpg",
        "AB145-10#":
          "https://romiku.com/images/products-local/ab145-10-hash.jpg",
      },
      powerSupplies: {},
    });
  });
});
