import { serverSupabaseTarget } from "../supabase/functions/_shared/deploymentTarget.js";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  normalizeInquiryExportModel,
  renderInquiryXlsx,
} from "../src/components/romiku/inquiries/inquiryXlsxRenderer.js";
import { readServerImageDimensions } from "./order-export-image.js";
import type { PreparedProductImage } from "../src/components/romiku/orders/orderXlsxRenderer.js";

const schema = z.object({ id: z.uuid(), submissionId: z.uuid() });
const reject = (status: number, error: string) =>
  Response.json(
    { success: false, error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
async function boundedBytes(response: Response, limit: number) {
  if (Number(response.headers.get("content-length")) > limit)
    throw new Error("response_too_large");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("empty_response");
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error("response_too_large");
    }
    parts.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result.buffer;
}
/** Server-only loader: exact saved website image, no current catalogue or redirects. */
export async function loadInquiryImage(
  url: string,
  row: number,
): Promise<PreparedProductImage | undefined> {
  if (!url) return;
  const source = new URL(url);
  if (
    source.protocol !== "https:" ||
    !["romiku.com", "www.romiku.com"].includes(source.hostname) ||
    source.username ||
    source.password ||
    source.port ||
    !source.pathname.startsWith("/images/products-local/")
  )
    throw new Error("invalid_image_source");
  const response = await fetch(source, {
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("image_unavailable");
  const type = response.headers.get("content-type")?.split(";")[0];
  if (!["image/png", "image/jpeg", "image/jpg"].includes(type || ""))
    throw new Error("unsupported_image");
  const buffer = await boundedBytes(response, 8_000_000);
  const dimensions = readServerImageDimensions(buffer);
  if (
    !dimensions ||
    dimensions.width <= 0 ||
    dimensions.height <= 0 ||
    dimensions.width > 12000 ||
    dimensions.height > 12000
  )
    throw new Error("invalid_image");
  return {
    ...dimensions,
    row,
    buffer,
    extension: type === "image/png" ? "png" : "jpeg",
  };
}
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return reject(405, "method_not_allowed");
    const secret = process.env.WEBSITE_INQUIRY_SECRET,
      service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = serverSupabaseTarget((key) => process.env[key]);
    if (!secret || !service || !supabaseUrl)
      return reject(503, "attachment_unavailable");
    const received = request.headers.get("X-ROMIKU-Website-Secret");
    if (
      !received ||
      !timingSafeEqual(
        createHash("sha256").update(received).digest(),
        createHash("sha256").update(secret).digest(),
      )
    )
      return reject(401, "unauthorized");
    if (
      request.headers.get("content-type")?.split(";")[0] !== "application/json"
    )
      return reject(415, "json_required");
    let body;
    try {
      body = schema.safeParse(
        JSON.parse(
          new TextDecoder().decode(
            await boundedBytes(new Response(request.body), 4096),
          ),
        ),
      );
    } catch {
      return reject(400, "invalid_json");
    }
    if (!body.success) return reject(422, "invalid_payload");
    const headers = { apikey: service, Authorization: `Bearer ${service}` };
    try {
      const filter = new URLSearchParams({
        id: `eq.${body.data.id}`,
        submission_id: `eq.${body.data.submissionId}`,
        select:
          "id,document_number,submitted_at,customer_name,company,brand,email,whatsapp,country",
      });
      const response = await fetch(
        `${supabaseUrl}/rest/v1/romiku_website_inquiries?${filter}`,
        { headers, signal: AbortSignal.timeout(8000) },
      );
      if (!response.ok) return reject(503, "attachment_unavailable");
      const records = await response.json();
      if (!Array.isArray(records) || records.length !== 1)
        return reject(404, "not_found");
      const inquiry = records[0];
      const itemsResponse = await fetch(
        `${supabaseUrl}/rest/v1/romiku_website_inquiry_items?${new URLSearchParams({ inquiry_id: `eq.${body.data.id}`, select: "id,sku,quantity,requirement,product_snapshot,position", order: "position.asc,id.asc", limit: "101" })}`,
        { headers, signal: AbortSignal.timeout(8000) },
      );
      if (!itemsResponse.ok) return reject(503, "attachment_unavailable");
      const items = await itemsResponse.json();
      if (!Array.isArray(items) || !items.length || items.length > 100)
        return reject(422, "invalid_items");
      const template = await readFile(
        join(
          process.cwd(),
          "src/assets/inquiry-templates/ROMIKU_网站询盘_模板.xlsx",
        ),
      );
      // Sequential, deduplicated image loading bounds simultaneous memory and traffic.
      const images = new Map<string, PreparedProductImage | undefined>();
      let totalBytes = 0;
      const model = normalizeInquiryExportModel(inquiry, items);
      for (const item of model.items) {
        if (images.has(item.imageUrl)) continue;
        const image = await loadInquiryImage(item.imageUrl, 9);
        if (image) {
          totalBytes += image.buffer.byteLength;
          if (totalBytes > 32_000_000) throw new Error("images_too_large");
        }
        images.set(item.imageUrl, image);
      }
      const output = await renderInquiryXlsx(
        model,
        new Uint8Array(template).buffer,
        {
          prepareImage: async (url, row) => {
            const image = images.get(url);
            return image ? { ...image, row } : undefined;
          },
        },
      );
      const number = /^WI-[A-Za-z0-9-]+$/.test(inquiry.document_number)
        ? inquiry.document_number
        : "INQUIRY";
      return new Response(output, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${number}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    } catch {
      return reject(503, "attachment_unavailable");
    }
  },
};
