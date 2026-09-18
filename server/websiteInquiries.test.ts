import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import endpoint from "../api/website-inquiries";

const payload = {
  customerName: " Original buyer ",
  email: "buyer@example.test",
  whatsapp: "+57 123",
  country: "Colombia",
  message: "Original request",
  items: [
    { sku: "SUNS15", quantity: 20, requirement: "White packaging" },
    { sku: "UNKNOWN", quantity: 1.25, requirement: "" },
  ],
};
const saved = {
  id: "10000000-0000-4000-8000-000000000001",
  document_number: "WI-000001",
};
const fetchMock = vi.fn<typeof fetch>();
let warn: ReturnType<typeof vi.spyOn>;

function request(
  body: unknown = payload,
  secret: string | null = "test-secret",
) {
  const headers = new Headers({ "content-type": "application/json" });
  if (secret !== null) headers.set("X-ROMIKU-Website-Secret", secret);
  return new Request("https://crm.example.test/api/website-inquiries", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("WEBSITE_INQUIRY_SECRET", "test-secret");
  vi.stubEnv("SUPABASE_URL", "https://db.example.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
  vi.stubGlobal("fetch", fetchMock);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  fetchMock.mockImplementation(async (url) => {
    if (String(url).includes("/rpc/")) return Response.json([saved]);
    if (String(url).includes("api.sanity.io"))
      return Response.json({ result: [] });
    return new Response(null, { status: 204 });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("website intake HTTP boundary", () => {
  it.each([null, "wrong-secret", "test-secret,test-secret"])(
    "rejects missing/wrong/duplicate credentials before persistence: %s",
    async (secret) => {
      const response = await endpoint.fetch(request(payload, secret));
      expect(response.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(await response.json()).toMatchObject({ success: false });
      expect(warn).toHaveBeenCalledWith("website_inquiry_rejected", {
        code: "unauthorized",
      });
    },
  );

  it("allows POST only", async () => {
    const response = await endpoint.fetch(
      new Request("https://crm.example.test/api/website-inquiries"),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "WEBSITE_INQUIRY_SECRET",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ])("fails closed when server configuration %s is missing", async (name) => {
    vi.stubEnv(name, "");
    const response = await endpoint.fetch(request());
    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const req = request();
    const response = await endpoint.fetch(
      new Request(req.url, { method: "POST", headers: req.headers, body: "{" }),
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts only JSON content", async () => {
    const req = request();
    req.headers.set("content-type", "text/plain");
    expect((await endpoint.fetch(req)).status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bounds actual body size even without Content-Length", async () => {
    expect(
      (
        await endpoint.fetch(
          request({ ...payload, extra: "x".repeat(1_048_576) }),
        )
      ).status,
    ).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    null,
    [],
    {},
    { ...payload, customerName: " " },
    { ...payload, email: "invalid" },
    { ...payload, whatsapp: null },
    { ...payload, country: 3 },
    { ...payload, message: undefined },
    { ...payload, company: null },
    { ...payload, items: [] },
    { ...payload, items: Array(101).fill(payload.items[0]) },
    ...[0, -1, "20", 0.00001, 100000000000000].map((quantity) => ({
      ...payload,
      items: [{ ...payload.items[0], quantity }],
    })),
    { ...payload, items: [{ ...payload.items[0], sku: " " }] },
    { ...payload, items: [{ ...payload.items[0], requirement: null }] },
  ])(
    "rejects invalid customer/item shapes without persistence: %#",
    async (body) => {
      const response = await endpoint.fetch(request(body));
      expect(response.status).toBe(422);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, " Original Company "])(
    "accepts the existing payload and optional company %s",
    async (company) => {
      const body = {
        ...payload,
        ...(company === undefined ? {} : { company }),
        extra: { original: true },
        owner_id: "untrusted",
      };
      const response = await endpoint.fetch(request(body));
      expect(response.status).toBe(201);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ success: true, ...saved });
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(
        "https://db.example.test/rest/v1/rpc/romiku_submit_website_inquiry",
      );
      expect(options?.method).toBe("POST");
      expect(new Headers(options?.headers).get("authorization")).toBe(
        "Bearer test-service-role",
      );
      expect(JSON.parse(options?.body as string)).toEqual({ payload: body });
      expect(JSON.stringify(options?.body)).not.toContain("test-secret");
    },
  );

  it("makes a new RPC call for each identical submission", async () => {
    await endpoint.fetch(request());
    await endpoint.fetch(request());
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes("/rpc/")),
    ).toHaveLength(2);
  });

  it.each(["reject", "http", "malformed"])(
    "does not report success or leak DB errors on %s persistence failure",
    async (mode) => {
      fetchMock.mockImplementationOnce(async () => {
        if (mode === "reject")
          throw new Error("test-service-role private database detail");
        if (mode === "http")
          return Response.json(
            { message: "test-service-role private database detail" },
            { status: 500 },
          );
        return Response.json([]);
      });
      const response = await endpoint.fetch(request());
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain("test-service-role");
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(
        /test-secret|test-service-role|buyer@example/,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("persists before bounded best-effort Sanity lookup; enrichment failure still succeeds", async () => {
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes("/rpc/")) return Response.json([saved]);
      throw new Error("Sanity unavailable");
    });
    const response = await endpoint.fetch(request());
    expect(response.status).toBe(201);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/rpc/");
    const lookup = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("api.sanity.io"),
    );
    expect(lookup).toBeDefined();
    expect(lookup?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("enriches only item metadata, never original SKU, quantity or requirement", async () => {
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes("/rpc/")) return Response.json([saved]);
      if (String(url).includes("api.sanity.io"))
        return Response.json({
          result: [{ _id: "sanity-one", sku: "SUNS15", name: { en: "Lamp" } }],
        });
      return new Response(null, { status: 204 });
    });
    expect((await endpoint.fetch(request())).status).toBe(201);
    const patches = fetchMock.mock.calls.filter(
      ([, options]) => options?.method === "PATCH",
    );
    expect(patches).toHaveLength(2);
    expect(String(patches[0][0])).toContain(`inquiry_id=eq.${saved.id}`);
    expect(JSON.parse(patches[0][1]?.body as string)).toEqual({
      sanity_product_id: "sanity-one",
      product_snapshot: {
        _id: "sanity-one",
        sku: "SUNS15",
        name: { en: "Lamp" },
      },
      match_status: "matched",
    });
    expect(JSON.parse(patches[1][1]?.body as string)).toEqual({
      match_status: "not_found",
    });
  });
});
