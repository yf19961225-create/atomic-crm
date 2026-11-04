/** DATE is already a business date; timestamps are projected into Shanghai. */
export function businessDate(instant: Date): string {
  if (!Number.isFinite(instant.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (key: string) => parts.find((item) => item.type === key)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function dayNumber(value: string): number {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = dateOnly ? value : businessDate(new Date(value));
  if (!date) return NaN;
  const milliseconds = Date.parse(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString().slice(0, 10) !== date
  )
    return NaN;
  return milliseconds / 86400000;
}
export function inRecentWindow(value: string, now: Date): boolean {
  const delta = dayNumber(value) - dayNumber(businessDate(now));
  return delta >= 0 && delta < 7;
}
export function isOverdue(value: string, now: Date): boolean {
  return dayNumber(value) < dayNumber(businessDate(now));
}
