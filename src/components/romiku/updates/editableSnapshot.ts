/** Comparison only: callers select editable fields; never change write payloads. */
export function editableSignature(
  values: Record<string, unknown>,
  fields: readonly string[],
  numbers: readonly string[] = [],
): string {
  const numeric = new Set(numbers);
  const normalize = (value: unknown, key: string): unknown => {
    if (value == null || value === "") return "";
    if (numeric.has(key) && Number.isFinite(Number(value)))
      return Number(value);
    if (Array.isArray(value)) return value.map((v) => normalize(v, key));
    if (typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, normalize(v, k)] as const)
          .filter(([, v]) => v !== ""),
      );
    return value;
  };
  return JSON.stringify(
    fields.map((key) => [
      key,
      normalize(
        key
          .split(".")
          .reduce<unknown>(
            (value, part) =>
              value && typeof value === "object"
                ? (value as Record<string, unknown>)[part]
                : undefined,
            values,
          ),
        key.split(".").at(-1)!,
      ),
    ]),
  );
}
