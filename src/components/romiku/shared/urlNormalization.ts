/**
 * Stores user-entered web addresses in a browser-safe, clickable form.
 * Empty values remain nullable so optional URL fields can be cleared.
 */
export function normalizeUrl(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function normalizeUrlMap(value: unknown): Record<string, string | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      normalizeUrl(entry),
    ]),
  );
}
