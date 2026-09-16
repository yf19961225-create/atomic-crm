export type SanityProductMatch = {
  sanityProductId: string;
  sku: string;
  title?: string;
};

export type SanitySkuLookupResult =
  | { status: "matched"; product: SanityProductMatch }
  | { status: "unmatched"; sku: string }
  | { status: "error"; sku: string; message: string };

/**
 * The host application owns the Sanity connection and mapping. This keeps this
 * browser bundle free of assumed project metadata, field names, and tokens.
 */
export type SanityProductLookupConfiguration = {
  lookupBySku: (sku: string) => Promise<unknown>;
  mapRecord: (record: unknown) => SanityProductMatch | null;
};

export type SanityProductSource = {
  initialState: { status: "loading" };
  findBySku: (sku: string) => Promise<SanitySkuLookupResult>;
};

const unmatched = (sku: string): SanitySkuLookupResult => ({
  status: "unmatched",
  sku,
});

export const createSanityProductSource = (
  configuration?: SanityProductLookupConfiguration,
): SanityProductSource => ({
  initialState: { status: "loading" },
  async findBySku(sku) {
    if (!configuration) return unmatched(sku);

    try {
      const record = await configuration.lookupBySku(sku);
      const product = record === null ? null : configuration.mapRecord(record);

      return product ? { status: "matched", product } : unmatched(sku);
    } catch {
      return {
        status: "error",
        sku,
        message: "Sanity product lookup failed.",
      };
    }
  },
});
