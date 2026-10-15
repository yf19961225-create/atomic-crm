const invalid = "工厂交期格式无效，请重新选择日期。";
const calendarDay = /^(\d{4})-(\d{2})-(\d{2})$/;
const businessZone = "Asia/Shanghai";

function validDay(value: string) {
  const match = calendarDay.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

// The column remains timestamptz. A chosen date ends at the end of that
// calendar day in the fixed business timezone, independent of the browser.
export function productionDueDatePayload(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new Error(invalid);
  if (validDay(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(
      Date.UTC(year, month - 1, day, 15, 59, 59, 999),
    ).toISOString();
  }
  // Preserve a previously saved timestamp when another field is edited.
  if (!calendarDay.test(value) && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return value;
  }
  throw new Error(invalid);
}

export function productionDueDateInput(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  if (validDay(value)) return value;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: businessZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function productionDueDateLabel(value: unknown): string {
  const date = productionDueDateInput(value);
  if (!date) return "—";
  const [year, month, day] = date.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}
