import { describe, expect, it } from "vitest";
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
