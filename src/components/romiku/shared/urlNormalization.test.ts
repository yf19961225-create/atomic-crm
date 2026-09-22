import { describe, expect, it } from "vitest";
import { normalizeUrl } from "./urlNormalization";

describe("normalizeUrl", () => {
  it.each([
    ["romiku.com", "https://romiku.com"],
    ["www.romiku.com", "https://www.romiku.com"],
    ["https://romiku.com", "https://romiku.com"],
    ["http://romiku.com", "http://romiku.com"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });

  it("returns null for an empty value", () => {
    expect(normalizeUrl("   ")).toBeNull();
    expect(normalizeUrl(null)).toBeNull();
  });
});
