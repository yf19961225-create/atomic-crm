const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Canonical strings and the former saved Sanity locale shape; never a lookup. */
const savedText = (value: unknown): string => {
  if (typeof value === "string") return value;
  const localized = object(value);
  return typeof localized.en === "string" && localized.en
    ? localized.en
    : typeof localized.zh === "string"
      ? localized.zh
      : "";
};

export function savedInquiryProduct(value: unknown) {
  const snapshot = object(value);
  const image = Array.isArray(snapshot.images)
    ? snapshot.images.map(object).find((entry) => typeof entry.url === "string")
    : undefined;
  const parameters = Array.isArray(snapshot.parameters)
    ? snapshot.parameters
        .map(object)
        .map((entry) => {
          const label = savedText(entry.label);
          const value = savedText(entry.value);
          return value ? [label, value].filter(Boolean).join(": ") : "";
        })
        .filter(Boolean)
        .join("\n")
    : "";
  return {
    name: savedText(snapshot.name),
    imageUrl:
      typeof snapshot.image_url === "string"
        ? snapshot.image_url
        : typeof image?.url === "string"
          ? image.url
          : "",
    specification: savedText(snapshot.specification) || parameters,
  };
}

/** Order only this Inquiry's already fetched rows, including stable legacy ties. */
export function orderInquiryItems<
  T extends { id?: unknown; position?: unknown },
>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) =>
      (Number(a.position) || 0) - (Number(b.position) || 0) ||
      String(a.id ?? "").localeCompare(String(b.id ?? "")),
  );
}
