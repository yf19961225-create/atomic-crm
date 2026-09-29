import JSZip from "jszip";

const LEGAL_COMPATIBILITY_ALIASES = {
  Arial: "Liberation Sans",
  "Songti SC Regular": "Noto Serif CJK SC",
  宋体: "Noto Serif CJK SC",
};

function attribute(xml, name) {
  return xml.match(new RegExp("\\b" + name + '="([^"]+)"'))?.[1];
}

function fontNames(stylesXml) {
  const fonts = stylesXml.match(/<fonts\b[^>]*>([\s\S]*?)<\/fonts>/)?.[1] || "";
  return [...fonts.matchAll(/<font>([\s\S]*?)<\/font>/g)].map(
    (match) => match[1].match(/<name\s+val="([^"]+)"\/>/)?.[1] || "Calibri",
  );
}

function styleFontIds(stylesXml) {
  const cellXfs =
    stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] || "";
  return [...cellXfs.matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map(
    (match) => Number(attribute(match[0], "fontId") || 0),
  );
}

function usedStyleIds(sheetXml) {
  return [...sheetXml.matchAll(/<c\b[^>]*>/g)].map((match) =>
    Number(attribute(match[0], "s") || 0),
  );
}

/** Extracts fonts actually referenced by cells, not unused declarations. */
export async function extractUsedTemplateFonts(xlsx) {
  const zip = await JSZip.loadAsync(xlsx);
  const [stylesXml, sheetXml] = await Promise.all([
    zip.file("xl/styles.xml")?.async("string"),
    zip.file("xl/worksheets/sheet1.xml")?.async("string"),
  ]);
  if (!stylesXml || !sheetXml)
    throw new Error("Order template is missing styles or worksheet XML");

  const names = fontNames(stylesXml);
  const ids = styleFontIds(stylesXml);
  return [
    ...new Set(
      usedStyleIds(sheetXml)
        .map((styleId) => names[ids[styleId] ?? 0])
        .filter(Boolean),
    ),
  ].sort();
}

/**
 * Fails closed if an actually used font cannot resolve to an exact legal font
 * or to the explicit, audited compatibility alias listed above.
 */
export async function preflightTemplateFonts(xlsx, inventory) {
  const requiredFamilies = await extractUsedTemplateFonts(xlsx);
  const resolvedFamilies = {};
  const unresolvedFamilies = [];

  for (const family of requiredFamilies) {
    const compatibleFamily = inventory[family]
      ? family
      : LEGAL_COMPATIBILITY_ALIASES[family];
    if (!compatibleFamily || !inventory[compatibleFamily]) {
      unresolvedFamilies.push(family);
      continue;
    }
    resolvedFamilies[family] = compatibleFamily;
  }

  return {
    ok: unresolvedFamilies.length === 0,
    requiredFamilies,
    resolvedFamilies,
    unresolvedFamilies,
  };
}

export { LEGAL_COMPATIBILITY_ALIASES };
