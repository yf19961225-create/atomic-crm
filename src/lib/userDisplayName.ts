/** Names come from the existing sales profile; IDs and emails are never labels. */
export function userDisplayName(
  profile?: {
    [field: string]: unknown;
    display_name?: unknown;
    first_name?: unknown;
    last_name?: unknown;
  } | null,
): string {
  const clean = (value: unknown): string => {
    if (typeof value !== "string") return "";
    const name = value.trim();
    return /^(pending\s*)+$/i.test(name) ? "" : name;
  };
  const display = clean(profile?.display_name);
  if (display) return display;
  const first = clean(profile?.first_name);
  const last = clean(profile?.last_name);
  if (first && last && /^[\p{Script=Han}]+$/u.test(first + last)) {
    return last + first;
  }
  return [first, last].filter(Boolean).join(" ") || "未设置姓名";
}
