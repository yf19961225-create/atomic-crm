import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// This module is only a Vercel Node function; never import it from the SPA.
const nonempty = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => value.trim().length > 0);
const submissionSchema = z.object({
  submissionId: z.uuid(),
  brand: z.string().max(200).optional(),
  customerName: nonempty(200),
  email: z
    .string()
    .max(320)
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
  whatsapp: z.string().max(100).nullish(),
  country: nonempty(100),
  message: z.string().max(10_000),
  company: z.string().max(200).optional(),
  items: z
    .array(
      z.object({
        sku: nonempty(200),
        productName: nonempty(500),
        image: z
          .string()
          .max(2048)
          .refine(
            (value) =>
              value === "" ||
              /^https:\/\/romiku\.com\/images\/products-local\/[^?#]+$/.test(
                value,
              ),
          ),
        specification: z.string().max(10_000),
        unit: z.string().max(100).optional(),
        cartonQty: z.number().nonnegative().max(100_000_000).nullish(),
        cartonCbm: z.number().nonnegative().max(1_000_000).nullish(),
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
const receiptSchema = z
  .array(
    z.object({
      id: z.uuid(),
      document_number: z.string().min(1),
      replay: z.boolean(),
      submitted_at: z.string().min(1),
      normalizedSubmission: submissionSchema,
    }),
  )
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
    let persistenceStage = "rpc_headers";
    try {
      const requestHeaders = new Headers(headers);
      persistenceStage = "rpc_request";
      const result = await fetch(
        `${restUrl}/rpc/romiku_submit_website_inquiry`,
        {
          method: "POST",
          headers: requestHeaders,
          signal: AbortSignal.timeout(10_000),
          // Only normalized business fields cross the persistence boundary.
          body: JSON.stringify({ payload: validated.data }),
        },
      );
      if (!result.ok) {
        console.warn("website_inquiry_persistence_failed", {
          stage: "rpc_http",
          status: result.status,
        });
        return reject(503, "intake_unavailable");
      }
      persistenceStage = "receipt_validation";
      receipt = receiptSchema.parse(await result.json())[0];
    } catch (error) {
      // Fixed stages only. Never log errors, response bodies, headers or payloads.
      console.warn("website_inquiry_persistence_failed", {
        stage: persistenceStage,
        reason:
          error instanceof Error && error.name === "TimeoutError"
            ? "timeout"
            : error instanceof Error && error.message === "fetch failed"
              ? "network"
              : "unexpected",
      });
      return reject(503, "intake_unavailable");
    }
    return Response.json(
      { success: true, ...receipt },
      {
        status: receipt.replay ? 200 : 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  },
};
