import { afterEach, expect, it, vi } from "vitest";
import productImages from "./product-images";

afterEach(() => vi.unstubAllGlobals());

it("finds all 17 website images by exact business SKU without borrowing a similar SKU", async () => {
  const affected = [
    ["858-S -D", "858-s-d", "858-s-d_main.jpg"],
    ["RDM202-C", "dm-202-c", "dm-202-c_main.jpg"],
    ["SUN SF10MAX", "sun-sf10max", "sunsf10max.jpg"],
    ["SUN SF10MAX-R", "sun-sf10max-r", "sunsf10max-r.jpg"],
    ["SUN SF20MAX", "sun-sf20max", "sunsf20max.jpg"],
    ["SUN SF20MAX-R", "sun-sf20max-r", "sunsf20max-r.jpg"],
    ["SUN SF30MAX", "sun-sf30max", "sunsf30max_main.jpg"],
    ["SUN SF30MAX-R", "sun-sf30max-r", "sunsf30max-r_main.jpg"],
    ["SUN SF40MAX", "sun-sf40max", "sunsf40max_main.jpg"],
    ["SUN SF40MAX-A", "sun-sf40max-a", "sunsf40max-a.jpg"],
    ["SUN SF40MAX-AR", "sun-sf40max-ar", "sunsf40max-ar.jpg"],
    ["SUN SF40MAX-R", "sun-sf40max-r", "sunsf40max-r_main.jpg"],
    ["QBC7PLUS-A", "sunc7plus-a", "qbc7plus-a.jpg"],
    ["QBC7PLUS-B", "sunc7plus-b", "qbc7plus-b.jpg"],
    ["SUNG2", "sung2-usb", "sung2.jpg"],
    ["SUNWY-08 -D", "sunwy-08-d", "sunwy-08-d_main.jpg"],
    ["XSUV-715PLUS -C", "xsuv-715plus-c", "xsuv-715plus--c.jpg"],
  ] as const;
  const websiteProducts: Record<string, { sku: string; image: string }> =
    Object.fromEntries(
      affected.map(([sku, key, filename]) => [
        key,
        { sku, image: `./images/products-local/${filename}` },
      ]),
    );
  websiteProducts["005"] = {
    sku: "005",
    image: "./images/products-local/005.jpg",
  };
  // A misleading index key must never make a different product's image match.
  const indexProducts: Record<string, { sku: string; image: string }> = {
    ...websiteProducts,
    "sun-sf30max-x": {
      sku: "SUN SF30MAX-X",
      image: "./images/products-local/wrong-model.jpg",
    },
  };
  websiteProducts["sun-sf30max-x"] = {
    sku: "SUN SF30MAX-R",
    image: "./images/products-local/wrong-model.jpg",
  };
  for (const key of ["duplicate-a", "duplicate-b"])
    indexProducts[key] = websiteProducts[key] = {
      sku: "DUPLICATE",
      image: `./images/products-local/${key}.jpg`,
    };
  const index = {
    chunks: { lamps: "products-lamps.js" },
    productChunks: Object.fromEntries(
      Object.keys(websiteProducts).map((key) => [key, "lamps"]),
    ),
    products: indexProducts,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          url.endsWith("products-index.js")
            ? `window.ROMIKU_PRODUCT_INDEX = ${JSON.stringify(index)};`
            : `window.ROMIKU_PRODUCTS = Object.assign(window.ROMIKU_PRODUCTS || {}, ${JSON.stringify(websiteProducts)});`,
          { status: 200 },
        ),
    ),
  );

  const requested = [
    ...affected.map(([sku]) => sku),
    "005",
    "SUN SF30MAX-X",
    "DUPLICATE",
    "TRULY-MISSING",
  ];
  const response = await productImages.fetch(
    new Request(
      `https://crm.example.test/api/product-images?${new URLSearchParams({ skus: requested.join(",") })}`,
    ),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { images: Record<string, string> };
  for (const [sku, , filename] of affected)
    expect(body.images[sku]).toBe(
      `https://romiku.com/images/products-local/${filename}`,
    );
  expect(body.images["005"]).toBe(
    "https://romiku.com/images/products-local/005.jpg",
  );
  expect(body.images["SUN SF30MAX-X"]).toBeUndefined();
  expect(body.images.DUPLICATE).toBeUndefined();
  expect(body.images["TRULY-MISSING"]).toBeUndefined();
  expect(Object.keys(body.images)).toHaveLength(18);
});
