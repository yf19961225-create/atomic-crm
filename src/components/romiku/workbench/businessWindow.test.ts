import { describe, expect, it } from "vitest";
import { businessDate, inRecentWindow, isOverdue } from "./businessWindow";

describe("Shanghai seven calendar days", () => {
  const now = new Date("2026-11-03T16:00:00Z");
  it("uses Shanghai midnight, not the host date", () => {
    expect(businessDate(now)).toBe("2026-11-04");
    expect(inRecentWindow("2026-11-03T16:00:00Z", now)).toBe(true);
    expect(inRecentWindow("2026-11-03T15:59:59Z", now)).toBe(false);
    expect(isOverdue("2026-11-03T15:59:59Z", now)).toBe(true);
  });
  it("includes today plus six days and excludes day seven", () => {
    expect(inRecentWindow("2026-11-04", now)).toBe(true);
    expect(inRecentWindow("2026-11-10", now)).toBe(true);
    expect(inRecentWindow("2026-11-10T15:59:59.999Z", now)).toBe(true);
    expect(inRecentWindow("2026-11-10T16:00:00Z", now)).toBe(false);
    expect(inRecentWindow("2026-11-11", now)).toBe(false);
  });
  it("handles month/year boundaries and empty or invalid dates", () => {
    const endYear = new Date("2026-12-29T16:00:00Z");
    expect(inRecentWindow("2027-01-05", endYear)).toBe(true);
    expect(inRecentWindow("2027-01-06", endYear)).toBe(false);
    for (const value of ["", "invalid", "2026-02-30"]) {
      expect(inRecentWindow(value, now)).toBe(false);
      expect(isOverdue(value, now)).toBe(false);
    }
  });
});
