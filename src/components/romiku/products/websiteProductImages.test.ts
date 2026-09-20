import { afterEach, describe, expect, it, vi } from "vitest";
import { loadWebsiteProductImages } from "./websiteProductImages";

const product = (id: string, sku: string) => ({
  id,
  sku,
  skuSort: sku,
  isPublished: true,
});

describe("loadWebsiteProductImages", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requests each SKU once when a catalog page contains duplicate SKUs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ images: { "005": "https://romiku.com/005.jpg" } }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const images = await loadWebsiteProductImages([
      product("first", "005"),
      product("second", "005"),
    ]);

    expect(fetchMock).toHaveBeenCalledWith("/api/product-images?skus=005");
    expect(images).toEqual(
      new Map([
        ["first", "https://romiku.com/005.jpg"],
        ["second", "https://romiku.com/005.jpg"],
      ]),
    );
  });
});
