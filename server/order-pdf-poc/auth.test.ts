import { describe, expect, it } from "vitest";

import { isAuthorized } from "../../services/order-pdf-poc/src/auth.mjs";

describe("isAuthorized", () => {
  it("requires the exact bearer token instead of accepting a signed XLSX URL alone", () => {
    expect(isAuthorized("Bearer preview-poc-token", "preview-poc-token")).toBe(
      true,
    );
    expect(isAuthorized(undefined, "preview-poc-token")).toBe(false);
    expect(isAuthorized("Bearer wrong-token", "preview-poc-token")).toBe(false);
  });
});
