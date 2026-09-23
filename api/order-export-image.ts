const allowedHosts = new Set(["romiku.com", "www.romiku.com"]);
const timeoutMs = 8_000;

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
      return new Response(await response.arrayBuffer(), {
        headers: {
          "Cache-Control": "private, max-age=300",
          "Content-Type": contentType,
        },
      });
    } catch {
      return reject(502, "image_unavailable");
    } finally {
      clearTimeout(timeout);
    }
  },
};
