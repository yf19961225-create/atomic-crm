import { beforeEach, afterEach, expect, it, vi } from "vitest";
import endpoint, { loadInquiryImage } from "../api/website-inquiry-xlsx";
import { renderInquiryXlsx } from "../src/components/romiku/inquiries/inquiryXlsxRenderer";
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from([1, 2])),
}));
vi.mock("../src/components/romiku/inquiries/inquiryXlsxRenderer", () => ({
  normalizeInquiryExportModel: vi.fn((header, items) => ({ header, items })),
  renderInquiryXlsx: vi.fn().mockResolvedValue(new Uint8Array([80, 75]).buffer),
}));
const id = "11111111-1111-4111-8111-111111111111",
  submissionId = "22222222-2222-4222-8222-222222222222";
const fetchMock = vi.fn<typeof fetch>();
const request = (body: unknown = { id, submissionId }, secret = "qa-secret") =>
  new Request("https://preview.example/api/website-inquiry-xlsx", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ROMIKU-Website-Secret": secret,
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.stubEnv("WEBSITE_INQUIRY_SECRET", "qa-secret");
  vi.stubEnv("SUPABASE_URL", "https://ciwaibtotispazfviims.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "qa-role");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url) =>
    Response.json(
      String(url).includes("romiku_website_inquiry_items")
        ? [
            {
              id: "item",
              sku: "SUN5",
              quantity: 120,
              product_snapshot: {
                name: "Saved name",
                image_url: "",
                specification: "Saved specs",
              },
            },
          ]
        : [
            {
              id,
              submission_id: submissionId,
              document_number: "WI-000123",
              submitted_at: "2026-10-01T01:00:00Z",
              customer_name: "Saved buyer",
            },
          ],
    ),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("requires server secret and exact record/submission pairing", async () => {
  expect((await endpoint.fetch(request(undefined, "wrong"))).status).toBe(401);
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock.mockResolvedValue(Response.json([]));
  expect((await endpoint.fetch(request())).status).toBe(404);
  expect(renderInquiryXlsx).not.toHaveBeenCalled();
});
it("uses only saved inquiry header/items and returns binary attachment without secret", async () => {
  const response = await endpoint.fetch(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("spreadsheetml");
  expect(response.headers.get("content-disposition")).toContain(
    "WI-000123.xlsx",
  );
  expect(renderInquiryXlsx).toHaveBeenCalledWith(
    expect.objectContaining({
      header: expect.objectContaining({ submitted_at: "2026-10-01T01:00:00Z" }),
      items: expect.arrayContaining([
        expect.objectContaining({ quantity: 120 }),
      ]),
    }),
    expect.any(ArrayBuffer),
    expect.any(Object),
  );
  expect(
    fetchMock.mock.calls.every(([url]) =>
      String(url).startsWith(
        "https://ciwaibtotispazfviims.supabase.co/rest/v1/",
      ),
    ),
  ).toBe(true);
  expect(String(fetchMock.mock.calls[0][0])).toContain("submission_id=eq.");
});
it("fails closed outside the named Preview or malformed request", async () => {
  expect(
    (await endpoint.fetch(request({ id: "bad", submissionId }))).status,
  ).toBe(422);
  vi.stubEnv("SUPABASE_URL", "https://other.supabase.co");
  expect((await endpoint.fetch(request())).status).toBe(503);
  expect(fetchMock).not.toHaveBeenCalled();
});
it("rejects external hosts, credentials, redirects and oversized images", async () => {
  for (const url of [
    "https://evil.example/a.png",
    "https://user:pass@romiku.com/images/products-local/a.png",
    "https://romiku.com/private/a.png",
    "http://romiku.com/images/products-local/a.png",
  ])
    await expect(loadInquiryImage(url, 9)).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock.mockResolvedValue(
    new Response("", {
      status: 302,
      headers: { location: "https://evil.example" },
    }),
  );
  await expect(
    loadInquiryImage("https://romiku.com/images/products-local/a.png", 9),
  ).rejects.toThrow();
  expect(fetchMock.mock.calls[0][1]?.redirect).toBe("error");
  fetchMock.mockResolvedValue(
    new Response("", {
      headers: { "content-type": "image/png", "content-length": "9000000" },
    }),
  );
  await expect(
    loadInquiryImage("https://romiku.com/images/products-local/a.png", 9),
  ).rejects.toThrow();
});
