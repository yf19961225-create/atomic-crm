import wordmark from "./romiku-wordmark.png";

/**
 * Product-only configuration kept outside Atomic CRM defaults so the upstream
 * component remains reusable without ROMIKU branding.
 */
export const romikuBrand = {
  title: "ROMIKU CRM 2.0",
  darkModeLogo: wordmark,
  lightModeLogo: wordmark,
} as const;
