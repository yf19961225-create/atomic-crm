import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import endpoint from "../api/website-inquiries";

// Opt in against the named local test stack only. No deployed credentials needed.
it.skipIf(process.env.ROMIKU_TEST_LOCAL_DB !== "1")(
  "real Vercel handler persists independent inquiries through local PostgREST/RPC",
  async () => {
    const local = JSON.parse(
      execFileSync("supabase", ["status", "-o", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
    const url = new URL(local.API_URL);
    if (url.hostname !== "127.0.0.1" || url.port !== "54321")
      throw new Error("Only the local atomic-crm-demo stack is allowed");
    const fixture = randomUUID();
    const realFetch = globalThis.fetch;
    const headers = {
      apikey: local.SERVICE_ROLE_KEY,
      Authorization: `Bearer ${local.SERVICE_ROLE_KEY}`,
    };
    const read = async (path: string) => {
      const result = await realFetch(`${url.origin}/rest/v1/${path}`, {
        headers,
      });
      expect(result.status).toBe(200);
      return result.json();
    };
    const body = {
      customerName: "Task9 local API fixture",
      email: "task9@example.test",
      whatsapp: "+57 123",
      country: "Colombia",
      message: "Original text",
      items: [
        {
          sku: "TASK9-UNKNOWN",
          quantity: 20,
          requirement: "Keep original",
          custom: { source: true },
        },
        { sku: "TASK9-UNKNOWN", quantity: 1.25, requirement: "" },
      ],
      task9Fixture: fixture,
    };
    const before = await Promise.all(
      [
        "romiku_outbound_companies",
        "romiku_formal_customers",
        "romiku_quotes",
      ].map((table) => read(`${table}?select=id`)),
    );
    vi.stubEnv("WEBSITE_INQUIRY_SECRET", "local-test-only");
    vi.stubEnv("SUPABASE_URL", url.origin);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", local.SERVICE_ROLE_KEY);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      (input: string | URL | Request, init?: RequestInit) => {
        if (String(input).includes("api.sanity.io"))
          throw new Error("Deliberate offline enrichment");
        if (!String(input).startsWith(`${url.origin}/`))
          throw new Error("Unexpected external request");
        return realFetch(input, init);
      },
    );
    try {
      const ids: string[] = [];
      for (const withCompany of [false, true]) {
        const payload = {
          ...body,
          ...(withCompany ? { company: "Optional Company" } : {}),
        };
        const response = await endpoint.fetch(
          new Request("http://localhost/api/website-inquiries", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-ROMIKU-Website-Secret": "local-test-only",
            },
            body: JSON.stringify(payload),
          }),
        );
        expect(response.status).toBe(201);
        const receipt = await response.json();
        expect(receipt.success).toBe(true);
        expect(receipt.document_number).toMatch(/^WI-\d+$/);
        ids.push(receipt.id);
        const [row] = await read(
          `romiku_website_inquiries?id=eq.${receipt.id}`,
        );
        expect(row).toMatchObject({
          raw_payload: payload,
          owner_id: null,
          created_by: null,
          status: "new",
          company: withCompany ? "Optional Company" : null,
        });
        const items = await read(
          `romiku_website_inquiry_items?inquiry_id=eq.${receipt.id}&order=quantity.desc`,
        );
        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({
          sku: "TASK9-UNKNOWN",
          quantity: 20,
          requirement: "Keep original",
          match_status: "unresolved",
        });
        expect(items[1]).toMatchObject({
          sku: "TASK9-UNKNOWN",
          quantity: 1.25,
          requirement: "",
        });
      }
      expect(new Set(ids).size).toBe(2);
      const after = await Promise.all(
        [
          "romiku_outbound_companies",
          "romiku_formal_customers",
          "romiku_quotes",
        ].map((table) => read(`${table}?select=id`)),
      );
      expect(after.map((rows) => rows.length)).toEqual(
        before.map((rows) => rows.length),
      );
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      // Remove only this random test marker, in the named local database. Original
      // protection is bypassed within this cleanup transaction, never by the API.
      execFileSync(
        "docker",
        [
          "exec",
          "-i",
          "supabase_db_atomic-crm-demo",
          "psql",
          "-U",
          "postgres",
          "-d",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        {
          input: `BEGIN; SET LOCAL session_replication_role=replica;
        DELETE FROM public.romiku_website_inquiry_items WHERE inquiry_id IN (SELECT id FROM public.romiku_website_inquiries WHERE raw_payload->>'task9Fixture'='${fixture}');
        DELETE FROM public.romiku_website_inquiries WHERE raw_payload->>'task9Fixture'='${fixture}'; COMMIT;`,
          stdio: ["pipe", "ignore", "pipe"],
        },
      );
    }
  },
  30_000,
);
