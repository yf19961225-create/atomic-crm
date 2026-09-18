import { expect, it } from "vitest";
import { assertLocalSmokeTarget } from "../e2e/localSmokeTarget";

it("rejects remote and ambiguous destinations before smoke fixtures can be written", () => {
  for (const target of [
    "https://crm2.romiku.com",
    "http://127.0.0.1.evil.test:5176",
    "http://user:password@127.0.0.1:5176",
    "http://127.0.0.1:5176/other",
  ]) {
    expect(() =>
      assertLocalSmokeTarget(target, "http://127.0.0.1:54321"),
    ).toThrow("local");
  }
  expect(() =>
    assertLocalSmokeTarget(
      "http://127.0.0.1:5176",
      "https://project.supabase.co",
    ),
  ).toThrow("local");
  expect(() =>
    assertLocalSmokeTarget("http://127.0.0.1:5176", "http://127.0.0.1:54341"),
  ).toThrow("local");
});

it("accepts the dedicated local smoke app and the named development API", () => {
  expect(() =>
    assertLocalSmokeTarget("http://127.0.0.1:5176", "http://127.0.0.1:54321"),
  ).not.toThrow();
});
