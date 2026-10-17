import { afterEach, beforeEach, expect, it, vi } from "vitest";
import endpoint from "../api/preview-secret-key-check";

const fetchMock = vi.fn<typeof fetch>();
const request = (method = "GET") =>
  new Request("https://preview.example/api/preview-secret-key-check", {
    method,
  });

beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "codex/production-factory-due-date");
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "a".repeat(40));
  vi.stubEnv("SUPABASE_URL", "https://ciwaibtotispazfviims.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-only-secret");
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
  ["missing new key", "SUPABASE_SECRET_KEY", ""],
])("refuses %s before any Supabase request", async (_name, key, value) => {
  vi.stubEnv(key, value);
  const response = await endpoint.fetch(request());
  expect(response.status).toBeGreaterThanOrEqual(400);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(JSON.stringify(await response.json())).not.toContain(
    "test-only-secret",
  );
});

it("rejects non-GET requests before any Supabase request", async () => {
  expect((await endpoint.fetch(request("POST"))).status).toBe(405);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("sends exactly one read-only Preview GET with apikey only", async () => {
  const response = await endpoint.fetch(request());
  expect(response.status).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(String(url)).toBe(
    "https://ciwaibtotispazfviims.supabase.co/rest/v1/romiku_product_extensions?select=id&limit=1",
  );
  expect(init?.method).toBe("GET");
  expect(init?.redirect).toBe("error");
  const headers = new Headers(init?.headers);
  expect(headers.get("apikey")).toBe("test-only-secret");
  expect(headers.has("Authorization")).toBe(false);
  expect(headers.has("User-Agent")).toBe(false);
  expect(await response.json()).toEqual({
    previewGuard: true,
    targetProjectRef: "ciwaibtotispazfviims",
    serviceRoleRequestSucceeded: true,
    httpStatus: 200,
    buildSha: "a".repeat(40),
  });
});

it("does not expose the upstream response body on failure", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response("sensitive error", { status: 401 }),
  );
  const response = await endpoint.fetch(request());
  expect(await response.json()).toMatchObject({
    previewGuard: true,
    serviceRoleRequestSucceeded: false,
    httpStatus: 401,
  });
});
