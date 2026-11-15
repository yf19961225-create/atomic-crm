import type { SanityCatalogProduct } from "../products/sanityCatalogSource";
export const productLanguages = {
  zh: "中文（zh-CN）",
  en: "English",
  es: "Español",
  "pt-BR": "Português — Brasil",
} as const;
export type DocumentLanguage = keyof typeof productLanguages;
export const documentLanguage = (value: unknown): DocumentLanguage =>
  typeof value === "string" && value in productLanguages
    ? (value as DocumentLanguage)
    : "zh";
export function localizedProductText(
  value: unknown,
  language: DocumentLanguage,
): string {
  // Language-neutral dimensions/technical tokens may be shared verbatim; prose may not.
  if (
    typeof value === "string" &&
    /^(?:[0-9.,×x/ +()%-]|(?:W|V|A|mA|Hz|kHz|RPM|LEDs?|mL|L|mm|cm|m|kg|g|PCS))+$/i.test(
      value.trim(),
    )
  )
    return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const source = value as Record<string, unknown>;
  const key = language === "pt-BR" ? "ptBR" : language;
  const text =
    source[language] ??
    source[key] ??
    (language === "zh" ? source["zh-CN"] : undefined);
  return typeof text === "string" || typeof text === "number"
    ? String(text).trim()
    : "";
}
export function productText(
  product: SanityCatalogProduct,
  language: DocumentLanguage,
  powerSupply?: Record<string, string>,
) {
  const specs = (product.parameters ?? []).filter((p) =>
    Object.values(p.label ?? {}).some((label) =>
      ["参数", "specifications", "especificaciones", "especificações"].includes(
        label.trim().toLowerCase(),
      ),
    ),
  );
  const parts = specs.map((p) => localizedProductText(p.value, language));
  const power = product.powerSupply ?? powerSupply;
  if (power && Object.values(power).some(Boolean))
    parts.push(localizedProductText(power, language));
  const name = localizedProductText(product.name, language);
  const specification =
    parts.length && parts.every(Boolean) ? parts.join(" ") : "";
  return { name, specification };
}
/** Only convert fields still equal to the last captured automatic text. Historical/manual text is preserved. */
export function translateSnapshot(
  snapshot: Record<string, unknown>,
  language: DocumentLanguage,
): Record<string, unknown> {
  const translations = snapshot.localized_text as
    | Record<string, { name: string; specification: string }>
    | undefined;
  const automatic = snapshot.automatic_text as
    | { name: string; specification: string }
    | undefined;
  const next = translations?.[language];
  if (!automatic || !next) return snapshot;
  const converted: Record<string, unknown> & {
    automatic_text: { name: string; specification: string };
    translation_pending: string[];
  } = {
    ...snapshot,
    language,
    automatic_text: { ...automatic },
    translation_pending: [] as string[],
  };
  for (const field of ["name", "specification"] as const) {
    if (snapshot[field] === automatic[field]) {
      converted[field] = next[field];
      converted.automatic_text[field] = next[field];
      if (!next[field]) converted.translation_pending.push(field);
    }
  }
  return converted;
}
