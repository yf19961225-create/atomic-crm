const pad = (n: number, length = 2) => String(n).padStart(length, "0");
const parts = (value: string) =>
  /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)?.slice(1).map(Number);
const utcDate = (y: number, m: number, d: number) => {
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  date.setUTCHours(0, 0, 0, 0);
  return date;
};
const utcText = (date: Date) =>
  `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
export function validBusinessDate(value: string) {
  const p = parts(value);
  return Boolean(
    p &&
      p[0] >= 1 &&
      p[0] <= 9999 &&
      utcText(utcDate(p[0], p[1], p[2])) === value,
  );
}
export function calendarDates(year: number, month: number) {
  const start = utcDate(year, month, 1);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) =>
    utcText(new Date(start.getTime() + i * 86400000)),
  );
}
export function localBusinessDateTime(value: string) {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}
/** Return zero, one, or two matching instants; never silently normalize DST gaps. */
export function resolveBusinessDateTime(
  date: string,
  time: string,
  previous?: string,
): string[] {
  if (!validBusinessDate(date)) return [];
  const match = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(time);
  if (!match) return [];
  const [h, m, s, ms] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3] ?? 0),
    Number((match[4] ?? "").padEnd(3, "0")),
  ];
  if (h > 23 || m > 59 || s > 59) return [];
  const old = previous ? localBusinessDateTime(previous) : "";
  if (
    old.slice(0, 10) === date &&
    (old.slice(11) === time ||
      (time.length === 5 && old.slice(11, 16) === time))
  )
    return [previous!];
  const [y, month, day] = parts(date)!;
  const candidate = new Date(0);
  candidate.setFullYear(y, month - 1, day);
  candidate.setHours(h, m, s, ms);
  const wanted = `${date}T${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
  const values = new Set<string>();
  for (let offset = -180; offset <= 180; offset += 15) {
    const d = new Date(candidate.getTime() + offset * 60000);
    if (localBusinessDateTime(d.toISOString()) === wanted)
      values.add(d.toISOString());
  }
  return [...values].sort();
}
export function businessDateLabel(value: unknown) {
  const text = String(value ?? "");
  if (!validBusinessDate(text)) return text || "—";
  const [y, m, d] = parts(text)!;
  return `${y}年${m}月${d}日`;
}
