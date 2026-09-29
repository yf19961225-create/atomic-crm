export type TemplateFontPreflight = {
  ok: boolean;
  requiredFamilies: string[];
  resolvedFamilies: Record<string, string>;
  unresolvedFamilies: string[];
};

export function extractUsedTemplateFonts(xlsx: Buffer): Promise<string[]>;
export function preflightTemplateFonts(
  xlsx: Buffer,
  inventory: Record<string, string | boolean>,
): Promise<TemplateFontPreflight>;
export const LEGAL_COMPATIBILITY_ALIASES: Record<string, string>;
