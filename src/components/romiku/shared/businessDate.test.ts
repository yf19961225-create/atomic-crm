import { afterEach, expect, it } from "vitest";
import { commands } from "vitest/browser";
import {
  calendarDates,
  validBusinessDate,
  localBusinessDateTime,
  resolveBusinessDateTime,
} from "./businessDate";
afterEach(async () => {
  await commands.setTimezone("Asia/Shanghai");
});
it("validates calendar dates and leap days independently from timestamp parsing", () => {
  expect(validBusinessDate("2024-02-29")).toBe(true);
  expect(validBusinessDate("2026-02-29")).toBe(false);
  expect(validBusinessDate("2026-02-30")).toBe(false);
  expect(validBusinessDate("10")).toBe(false);
  expect(calendarDates(2026, 2)).toHaveLength(42);
  expect(calendarDates(2026, 2)).toContain("2026-02-28");
  expect(calendarDates(2026, 2)).not.toContain("2026-02-29");
});
it.each(["UTC", "Asia/Shanghai", "America/Los_Angeles"])(
  "preserves date-only and unchanged timestamp precision in %s",
  async (zone) => {
    await commands.setTimezone(zone);
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
    expect(validBusinessDate("2026-10-31")).toBe(true);
    const original = "2026-10-31T12:34:56.789Z";
    const local = localBusinessDateTime(original);
    expect(
      resolveBusinessDateTime(local.slice(0, 10), local.slice(11), original),
    ).toEqual([original]);
  },
);
it("retains local wall-clock time and seconds when calendar day changes", async () => {
  await commands.setTimezone("Asia/Shanghai");
  expect(
    resolveBusinessDateTime(
      "2026-11-01",
      "20:34:56.789",
      "2026-10-31T12:34:56.789Z",
    ),
  ).toEqual(["2026-11-01T12:34:56.789Z"]);
});
it("rejects DST gaps and offers both instants for ambiguous times", async () => {
  await commands.setTimezone("America/Los_Angeles");
  expect(resolveBusinessDateTime("2026-03-08", "02:30")).toEqual([]);
  expect(resolveBusinessDateTime("2026-11-01", "01:30")).toEqual([
    "2026-11-01T08:30:00.000Z",
    "2026-11-01T09:30:00.000Z",
  ]);
  expect(
    resolveBusinessDateTime("2026-11-01", "01:30", "2026-11-01T09:30:12.345Z"),
  ).toEqual(["2026-11-01T09:30:12.345Z"]);
});
