import { afterEach, beforeEach, expect, it, vi } from "vitest";
import endpoint from "../api/preview-service-role-check";

const fetchMock = vi.fn<typeof fetch>();
const request = (method = "GET") =>
  new Request("https://preview.example/api/preview-service-role-check", {
    method,
  });

beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "codex/production-factory-due-date");
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "a".repeat(40));
  vi.stubEnv("SUPABASE_URL", "https://ciwaibtotispazfviims.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-key");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(Response.json([{ id: "private-record-id" }]));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it.each([
  ["environment", "VERCEL_ENV", "production"],
  ["branch", "VERCEL_GIT_COMMIT_REF", "main"],
  ["target", "SUPABASE_URL", "https://vddjodsbmuarshnytyvb.supabase.co"],
  [
    "target suffix",
    "SUPABASE_URL",
    "https://ciwaibtotispazfviims.supabase.co.evil.example",
  ],
  ["missing key", "SUPABASE_SERVICE_ROLE_KEY", ""],
])("refuses %s before any Supabase request", async (_name, variable, value) => {
  vi.stubEnv(variable, value);
  const response = await endpoint.fetch(request());
  expect(response.status).toBeGreaterThanOrEqual(400);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(JSON.stringify(await response.json())).not.toContain("test-only-key");
});

it("rejects non-GET requests without contacting Supabase", async () => {
  expect((await endpoint.fetch(request("POST"))).status).toBe(405);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("uses the runtime key for exactly one read-only Preview GET and returns no data", async () => {
  const response = await endpoint.fetch(request());
  expect(response.status).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(String(url)).toBe(
    "https://ciwaibtotispazfviims.supabase.co/rest/v1/romiku_product_extensions?select=id&limit=1",
  );
  expect(init?.method).toBe("GET");
  expect(init?.redirect).toBe("error");
  expect(new Headers(init?.headers).get("apikey")).toBe("test-only-key");
  expect(new Headers(init?.headers).get("Authorization")).toBe(
    "Bearer test-only-key",
  );
  const body = await response.json();
  expect(body).toEqual({
    previewGuard: true,
    targetProjectRef: "ciwaibtotispazfviims",
    serviceRoleRequestSucceeded: true,
    httpStatus: 200,
    buildSha: "a".repeat(40),
  });
  expect(JSON.stringify(body)).not.toContain("private-record-id");
  expect(JSON.stringify(body)).not.toContain("test-only-key");
});

it("reports an upstream failure without leaking the response body", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response("sensitive error", { status: 401 }),
  );
  const response = await endpoint.fetch(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    previewGuard: true,
    serviceRoleRequestSucceeded: false,
    httpStatus: 401,
  });
});
