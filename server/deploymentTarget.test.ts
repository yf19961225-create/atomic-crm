import { expect, it } from "vitest";
import { serverSupabaseTarget } from "../supabase/functions/_shared/deploymentTarget";
const refs = {
  preview: "ciwaibtotispazfviims",
  production: "vddjodsbmuarshnytyvb",
};
it.each(["preview", "production"] as const)(
  "%s only permits its own server target",
  (env) => {
    for (const [target, ref] of Object.entries(refs)) {
      const vars = {
        VERCEL_ENV: env,
        SUPABASE_URL: `https://${ref}.supabase.co`,
      };
      expect(serverSupabaseTarget((k) => vars[k as keyof typeof vars])).toBe(
        target === env ? vars.SUPABASE_URL : null,
      );
    }
  },
);
it("fails closed on absent environment, malformed URLs and frontend spoofing", () => {
  for (const url of [
    "",
    "https://ciwaibtotispazfviims.supabase.co.evil.test",
    "https://user@ciwaibtotispazfviims.supabase.co",
    "https://ciwaibtotispazfviims.supabase.co/rest/v1",
    "http://ciwaibtotispazfviims.supabase.co",
  ]) {
    const vars = {
      VERCEL_ENV: "preview",
      SUPABASE_URL: url,
      VITE_SUPABASE_URL: "https://ciwaibtotispazfviims.supabase.co",
    };
    expect(
      serverSupabaseTarget((k) => vars[k as keyof typeof vars]),
    ).toBeNull();
  }
  expect(serverSupabaseTarget(() => undefined)).toBeNull();
});
it("edge environment is explicit and cannot override Vercel", () => {
  const vars = {
    VERCEL_ENV: "production",
    ROMIKU_DEPLOYMENT_ENV: "preview",
    SUPABASE_URL: `https://${refs.preview}.supabase.co`,
  };
  expect(serverSupabaseTarget((k) => vars[k as keyof typeof vars])).toBeNull();
  expect(
    serverSupabaseTarget(
      (k) =>
        ({
          ROMIKU_DEPLOYMENT_ENV: "production",
          SUPABASE_URL: `https://${refs.production}.supabase.co`,
        })[k],
    ),
  ).toBe(`https://${refs.production}.supabase.co`);
});
it("development is restricted to the local Supabase test endpoint", () => {
  expect(
    serverSupabaseTarget(
      (k) =>
        ({ VERCEL_ENV: "development", SUPABASE_URL: "http://127.0.0.1:54321" })[
          k
        ],
    ),
  ).toBe("http://127.0.0.1:54321");
  expect(
    serverSupabaseTarget(
      (k) =>
        ({
          VERCEL_ENV: "development",
          SUPABASE_URL: `https://${refs.production}.supabase.co`,
        })[k],
    ),
  ).toBeNull();
});

it("both service-role APIs reject cross-environment targets before fetching", async () => {
  const { vi } = await import("vitest");
  const [{ default: inquiry }, { default: xlsx }] = await Promise.all([
    import("../api/website-inquiries"),
    import("../api/website-inquiry-xlsx"),
  ]);
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  try {
    for (const api of [inquiry, xlsx]) {
      for (const [env, opposite] of [
        ["preview", refs.production],
        ["production", refs.preview],
      ]) {
        vi.stubEnv("VERCEL_ENV", env);
        vi.stubEnv("ROMIKU_DEPLOYMENT_ENV", "");
        vi.stubEnv("SUPABASE_URL", `https://${opposite}.supabase.co`);
        vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-fixture-only");
        vi.stubEnv("WEBSITE_INQUIRY_SECRET", "test-fixture-only");
        const response = await api.fetch(
          new Request("https://example.test/api", { method: "POST" }),
        );
        expect(response.status).toBe(503);
      }
    }
    expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  }
});
