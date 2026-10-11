/** Strip only a leading presentation label; preserve saved content and line breaks. */
export function normalizeSpecificationDisplay(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/^(?:specifications?|specs)\s*:\s*/i, "")
    .trim();
}
