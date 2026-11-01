import { describe, expect, it, vi } from "vitest";
import { assertDeploymentBuildTarget } from "./deploymentBuildTarget";

const refs = {
  preview: "ciwaibtotispazfviims",
  production: "vddjodsbmuarshnytyvb",
};

function vars(environment: "preview" | "production", ref = refs[environment]) {
  return {
    VERCEL: "1",
    VERCEL_ENV: environment,
    VITE_SUPABASE_URL: `https://${ref}.supabase.co`,
    SUPABASE_URL: `https://${ref}.supabase.co`,
  };
}

describe("deployment build target", () => {
  it.each(["preview", "production"] as const)(
    "accepts only the %s Supabase project",
    (environment) => {
      expect(assertDeploymentBuildTarget(vars(environment))).toEqual({
        environment,
        projectRef: refs[environment],
      });
      const opposite = environment === "preview" ? "production" : "preview";
      expect(() =>
        assertDeploymentBuildTarget(vars(environment, refs[opposite])),
      ).toThrow();
    },
  );

  it("rejects a mismatch between browser and server targets", () => {
    expect(() =>
      assertDeploymentBuildTarget({
        ...vars("preview"),
        SUPABASE_URL: `https://${refs.production}.supabase.co`,
      }),
    ).toThrow();
  });

  it.each([
    "http://ciwaibtotispazfviims.supabase.co",
    "https://ciwaibtotispazfviims.supabase.co.evil.test",
    "https://user@ciwaibtotispazfviims.supabase.co",
    "https://ciwaibtotispazfviims.supabase.co/rest/v1",
    "https://ciwaibtotispazfviims.supabase.co?x=1",
    "",
  ])("rejects malformed or absent URLs: %s", (url) => {
    expect(() =>
      assertDeploymentBuildTarget({
        ...vars("preview"),
        VITE_SUPABASE_URL: url,
      }),
    ).toThrow();
  });

  it("rejects a Vercel build with no declared environment", () => {
    expect(() =>
      assertDeploymentBuildTarget({ ...vars("preview"), VERCEL_ENV: "" }),
    ).toThrow();
  });

  it("allows ordinary local builds without a Vercel deployment target", () => {
    expect(assertDeploymentBuildTarget({})).toBeNull();
  });
});

describe("strict Production URL evidence", () => {
  it("emits complete evidence only for exact URLs without exposing values", () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      assertDeploymentBuildTarget(vars("production"));
      expect(log.mock.calls.map(([message]) => message)).toEqual([
        "PRODUCTION_URL_GUARD START",
        "VITE_SUPABASE_URL PASS",
        "SUPABASE_URL PASS",
        "PRODUCTION_URL_GUARD PASS",
      ]);
    } finally {
      log.mockRestore();
    }
  });

  it.each(["VITE_SUPABASE_URL", "SUPABASE_URL"])(
    "rejects normalization and placeholders for %s without leaking values",
    (key) => {
      const log = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        for (const value of [
          vars("production")[key as "SUPABASE_URL"] + "/",
          "[SENSITIVE]",
          " https://vddjodsbmuarshnytyvb.supabase.co",
          undefined,
        ]) {
          log.mockClear();
          expect(() =>
            assertDeploymentBuildTarget({
              ...vars("production"),
              [key]: value,
            }),
          ).toThrow();
          const messages = log.mock.calls.map(([message]) => message);
          expect(messages).toContain(key + " FAIL");
          expect(messages).not.toContain("PRODUCTION_URL_GUARD PASS");
          expect(messages.join("\n")).not.toContain("supabase.co");
          expect(messages.join("\n")).not.toContain("[SENSITIVE]");
        }
      } finally {
        log.mockRestore();
      }
    },
  );
});
