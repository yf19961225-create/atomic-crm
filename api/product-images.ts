const websiteOrigin = "https://romiku.com/";
const indexUrl = `${websiteOrigin}data/products-index.js`;
const maxSkus = 50;
const productIndexPrefix = "window.ROMIKU_PRODUCT_INDEX =";
const productChunkPrefix = "window.ROMIKU_PRODUCTS || {},";

type WebsiteProduct = {
  sku?: string;
  image?: string;
  images?: unknown;
};
type WebsiteIndex = {
  chunks?: Record<string, string>;
  productChunks?: Record<string, string>;
};

const jsonObjectAfter = (source: string, marker: string): unknown => {
  const markerIndex = source.indexOf(marker);
  const start = source.indexOf("{", markerIndex + marker.length);
  if (markerIndex < 0 || start < 0) throw new Error("unknown_website_format");
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0)
      return JSON.parse(source.slice(start, index + 1));
  }
  throw new Error("unknown_website_format");
};

const readText = async (url: string) => {
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) throw new Error("website_unavailable");
  return response.text();
};

const imageUrl = (product: WebsiteProduct) => {
  const relativeImage =
    product.image ||
    (Array.isArray(product.images)
      ? product.images.find(
          (value): value is string =>
            typeof value === "string" && Boolean(value),
        )
      : "") ||
    "";
  return relativeImage ? new URL(relativeImage, websiteOrigin).href : "";
};

const parseSkus = (url: URL) => {
  const values = url.searchParams.getAll("skus");
  if (values.length !== 1) return null;
  const skus = values[0].split(",");
  if (
    !skus.length ||
    skus.length > maxSkus ||
    skus.some((sku) => !sku || sku.length > 100) ||
    new Set(skus).size !== skus.length
  )
    return null;
  return skus;
};

const reject = (status: number, error: string, headers?: HeadersInit) =>
  Response.json(
    { error },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET")
      return reject(405, "method_not_allowed", { Allow: "GET" });
    const skus = parseSkus(new URL(request.url));
    if (!skus) return reject(400, "invalid_skus");
    try {
      const index = jsonObjectAfter(
        await readText(indexUrl),
        productIndexPrefix,
      ) as WebsiteIndex;
      const chunks = new Map<string, string[]>();
      for (const sku of skus) {
        const category = index.productChunks?.[sku];
        const chunk = category ? index.chunks?.[category] : undefined;
        if (!chunk || !/^products-[a-z-]+\.js$/.test(chunk)) continue;
        chunks.set(chunk, [...(chunks.get(chunk) ?? []), sku]);
      }
      const images: Record<string, string> = {};
      await Promise.all(
        [...chunks].map(async ([chunk, chunkSkus]) => {
          const products = jsonObjectAfter(
            await readText(new URL(`data/${chunk}`, websiteOrigin).href),
            productChunkPrefix,
          ) as Record<string, WebsiteProduct>;
          for (const sku of chunkSkus) {
            const url = imageUrl(products[sku] ?? {});
            if (url) images[sku] = url;
          }
        }),
      );
      return Response.json({ images });
    } catch {
      return reject(502, "website_images_unavailable");
    }
  },
};
