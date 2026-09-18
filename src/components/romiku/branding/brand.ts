import wordmark from "./romiku-wordmark.png";
import wordmarkOnWhite from "./romiku-wordmark-on-white.svg";

/**
 * Product-only configuration kept outside Atomic CRM defaults so the upstream
 * component remains reusable without ROMIKU branding.
 */
export const romikuBrand = {
  title: "ROMIKU CRM 2.0",
  darkModeLogo: wordmarkOnWhite,
  lightModeLogo: wordmark,
} as const;
