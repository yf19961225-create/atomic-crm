import type { ConfigurationContextValue } from "@/components/atomic-crm/root/ConfigurationContext";
import { romikuBrand } from "./brand";

/** Presentation-only override: preserves every business preference. */
export const applyRomikuBrand = <T extends Partial<ConfigurationContextValue>>(
  configuration: T,
) =>
  ({
    ...configuration,
    title: romikuBrand.title,
    darkModeLogo: romikuBrand.darkModeLogo,
    lightModeLogo: romikuBrand.lightModeLogo,
  }) as T &
    Pick<ConfigurationContextValue, "title" | "darkModeLogo" | "lightModeLogo">;
