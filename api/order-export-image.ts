const allowedHosts = new Set(["romiku.com", "www.romiku.com"]);
const timeoutMs = 8_000;

/** Reads trusted PNG/JPEG source pixels in the export proxy before response. */
export const readServerImageDimensions = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const view = new DataView(buffer);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  for (let offset = 2; offset + 8 < bytes.length; ) {
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isStartOfFrame)
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
      };
    if (length < 2) break;
    offset += length;
  }
  return undefined;
};

const reject = (status: number, error: string) =>
  Response.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );

/** Read-only, hostname-restricted image fetch for saved Order snapshots. */
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET") return reject(405, "method_not_allowed");
    const source = new URL(request.url).searchParams.get("url");
    if (!source) return reject(400, "missing_url");
    let imageUrl: URL;
    try {
      imageUrl = new URL(source);
    } catch {
      return reject(400, "invalid_url");
    }
    if (imageUrl.protocol !== "https:" || !allowedHosts.has(imageUrl.hostname))
      return reject(400, "unsupported_image_source");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(imageUrl, { signal: controller.signal });
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !/^image\/(png|jpe?g|webp)$/i.test(contentType))
        return reject(502, "image_unavailable");
      const image = await response.arrayBuffer();
      const dimensions = readServerImageDimensions(image);
      return new Response(image, {
        headers: {
          "Cache-Control": "private, max-age=300",
          "Content-Type": contentType,
          ...(dimensions && {
            "X-Image-Width": String(dimensions.width),
            "X-Image-Height": String(dimensions.height),
          }),
        },
      });
    } catch {
      return reject(502, "image_unavailable");
    } finally {
      clearTimeout(timeout);
    }
  },
};
