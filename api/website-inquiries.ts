import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// This module is only a Vercel Node function; never import it from the SPA.
const nonempty = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => value.trim().length > 0);
const submissionSchema = z.object({
  customerName: nonempty(200),
  email: z
    .string()
    .max(320)
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
  whatsapp: nonempty(100),
  country: nonempty(100),
  message: z.string().max(10_000),
  company: z.string().max(200).optional(),
  items: z
    .array(
      z.object({
        sku: nonempty(200),
        quantity: z
          .number()
          .positive()
          .lt(100_000_000_000_000)
          .refine((value) => value === Number(value.toFixed(4))),
        requirement: z.string().max(10_000),
      }),
    )
    .min(1)
    .max(100),
});
type Submission = z.infer<typeof submissionSchema>;
const receiptSchema = z
  .array(z.object({ id: z.uuid(), document_number: z.string().min(1) }))
  .length(1);
const maxBodyBytes = 1_048_576;

function reject(status: number, code: string, headers?: HeadersInit) {
  // Fixed codes only: no body, headers, email, credentials, or upstream errors.
  console.warn("website_inquiry_rejected", { code });
  return Response.json(
    { success: false, error: code },
    {
      status,
      headers: { "Cache-Control": "no-store", ...headers },
    },
  );
}

function credentialsMatch(received: string | null, expected: string) {
  if (!received) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(received), digest(expected));
}

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBodyBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function enrichItems(
  inquiryId: string,
  items: Submission["items"],
  restUrl: string,
  headers: Record<string, string>,
) {
  // Existing public Sanity catalog; no private token or second product master.
  // A single budget covers lookup and updates. All originals are already saved.
  const signal = AbortSignal.timeout(2_000);
  const skus = [...new Set(items.map((item) => item.sku))];
  const params = new URLSearchParams({
    query:
      '*[_type == "product" && sku in $skus && !(_id in path("drafts.**"))]{_id,sku,name,images[]{url},parameters[]{label,value},category->{_id,title},moqQuantity,moqUnit,packaging,cartonQty,powerSupply,isPublished,colors}',
    $skus: JSON.stringify(skus),
  });
  const response = await fetch(
    `https://gxuvcyaa.api.sanity.io/v2025-07-05/data/query/production?${params}`,
    { signal },
  );
  if (!response.ok) throw new Error("enrichment_failed");
  const { result } = (await response.json()) as {
    result?: Array<Record<string, unknown>>;
  };
  if (!Array.isArray(result)) throw new Error("enrichment_failed");
  // Bound concurrency to avoid a large item list flooding Supabase.
  for (let start = 0; start < skus.length; start += 5) {
    await Promise.all(
      skus.slice(start, start + 5).map(async (sku) => {
        const product = result.find(
          (record) => record?.sku === sku && typeof record._id === "string",
        );
        const filters = new URLSearchParams({
          inquiry_id: `eq.${inquiryId}`,
          // Quote/escape PostgREST filter values so literal commas/quotes in SKUs
          // cannot alter which rows get enrichment metadata.
          sku: `eq.${JSON.stringify(sku)}`,
        });
        const updated = await fetch(
          `${restUrl}/romiku_website_inquiry_items?${filters}`,
          {
            method: "PATCH",
            headers,
            signal,
            body: JSON.stringify(
              product
                ? {
                    sanity_product_id: product._id,
                    product_snapshot: product,
                    match_status: "matched",
                  }
                : { match_status: "not_found" },
            ),
          },
        );
        if (!updated.ok) throw new Error("enrichment_failed");
      }),
    );
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST")
      return reject(405, "method_not_allowed", { Allow: "POST" });
    const secret = process.env.WEBSITE_INQUIRY_SECRET;
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret || !supabaseUrl || !serviceRole)
      return reject(503, "intake_unavailable");
    if (
      !credentialsMatch(request.headers.get("X-ROMIKU-Website-Secret"), secret)
    )
      return reject(401, "unauthorized");
    if (
      request.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/json"
    )
      return reject(415, "json_required");
    let rawPayload: unknown;
    try {
      const body = await readBody(request);
      if (body === null) return reject(413, "payload_too_large");
      rawPayload = JSON.parse(body);
    } catch {
      return reject(400, "invalid_json");
    }
    const validated = submissionSchema.safeParse(rawPayload);
    if (!validated.success) return reject(422, "invalid_payload");
    const restUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1`;
    const headers = {
      "Content-Type": "application/json",
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
    };
    let receipt: z.infer<typeof receiptSchema>[number];
    try {
      const result = await fetch(
        `${restUrl}/rpc/romiku_submit_website_inquiry`,
        {
          method: "POST",
          headers,
          signal: AbortSignal.timeout(10_000),
          // Preserve unknown business fields; never append HTTP headers or secrets.
          body: JSON.stringify({ payload: rawPayload }),
        },
      );
      if (!result.ok) return reject(503, "intake_unavailable");
      receipt = receiptSchema.parse(await result.json())[0];
    } catch {
      return reject(503, "intake_unavailable");
    }
    try {
      await enrichItems(receipt.id, validated.data.items, restUrl, headers);
    } catch {
      console.warn("website_inquiry_enrichment_failed");
    }
    return Response.json(
      { success: true, ...receipt },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  },
};
