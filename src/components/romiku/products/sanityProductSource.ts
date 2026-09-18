import {
  createContext,
  createElement,
  useContext,
  type ReactNode,
} from "react";

export type SanityProductMatch = {
  sanityProductId: string;
  sku: string;
  title?: string;
  imageUrl?: string;
  parameters?: unknown;
  category?: unknown;
  moqQuantity?: number;
  moqUnit?: unknown;
  packaging?: unknown;
  cartonQty?: number;
  powerSupply?: unknown;
  isPublished?: boolean;
  sortOrder?: number;
  colors?: unknown;
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

const sanityProductSourceContext = createContext<SanityProductSource | null>(
  null,
);

export const SanityProductSourceProvider = ({
  source,
  children,
}: {
  source: SanityProductSource;
  children: ReactNode;
}) =>
  createElement(
    sanityProductSourceContext.Provider,
    { value: source },
    children,
  );

export const useSanityProductSource = () =>
  useContext(sanityProductSourceContext) ?? createSanityProductSource();

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
        message: "Sanity 产品查询失败。",
      };
    }
  },
});
