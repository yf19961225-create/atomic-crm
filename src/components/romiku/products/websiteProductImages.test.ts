import { afterEach, describe, expect, it, vi } from "vitest";
import {
  catalogProductImageCandidates,
  catalogThumbnailImageCandidates,
  loadWebsiteProductImages,
} from "./websiteProductImages";

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

describe("catalogProductImageCandidates", () => {
  it("uses an exact-SKU website thumbnail first without reordering Sanity gallery images", () => {
    const item = {
      ...product("sanity-1", "GC043"),
      images: [
        { url: "https://cdn.example.com/main.jpg" },
        { url: "https://cdn.example.com/side.jpg" },
      ],
    };
    expect(
      catalogThumbnailImageCandidates(item, "https://romiku.com/gc043.jpg"),
    ).toEqual([
      "https://romiku.com/gc043.jpg",
      "https://cdn.example.com/main.jpg",
      "https://cdn.example.com/side.jpg",
    ]);
    expect(
      catalogProductImageCandidates(item, "https://romiku.com/gc043.jpg"),
    ).toEqual([
      "https://cdn.example.com/main.jpg",
      "https://cdn.example.com/side.jpg",
      "https://romiku.com/gc043.jpg",
    ]);
  });
  it("prefers the current Sanity image and retains the matching website image as fallback", () => {
    expect(
      catalogProductImageCandidates(
        {
          ...product("sanity-1", "SUN SF30MAX"),
          images: [{ url: "https://cdn.example.com/current.png" }],
        },
        "https://romiku.com/current.png",
      ),
    ).toEqual([
      "https://cdn.example.com/current.png",
      "https://romiku.com/current.png",
    ]);
  });

  it("uses the next valid Sanity image and never guesses another SKU image", () => {
    expect(
      catalogProductImageCandidates({
        ...product("sanity-2", "SUN SF20MAX-R"),
        images: [{ url: "" }, { url: "https://cdn.example.com/second.png" }],
      }),
    ).toEqual(["https://cdn.example.com/second.png"]);
    expect(
      catalogProductImageCandidates({
        ...product("sanity-3", "SUN SF20MAX-R"),
        images: [],
      }),
    ).toEqual([]);
  });

  it("skips empty and malformed image entries while preserving valid Sanity order", () => {
    const item = {
      ...product("sanity-4", "GC043"),
      images: [
        { url: "" },
        { url: "not-a-url" },
        { url: "https://cdn.example.com/first.jpg" },
        { url: "https://cdn.example.com/second.jpg" },
      ],
    };
    expect(catalogThumbnailImageCandidates(item)).toEqual([
      "https://cdn.example.com/first.jpg",
      "https://cdn.example.com/second.jpg",
    ]);
    expect(catalogThumbnailImageCandidates({ ...item, images: [] })).toEqual(
      [],
    );
  });
});
