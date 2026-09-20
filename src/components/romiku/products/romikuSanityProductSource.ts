import {
  createSanityProductSource,
  type SanityProductMatch,
} from "./sanityProductSource";

export const romikuSanityConfig = {
  projectId: "gxuvcyaa",
  dataset: "production",
  apiVersion: "2025-07-05",
} as const;

type SanityRecord = {
  _id: string;
  sku: string;
  name?: Record<string, string>;
  images?: Array<{ url?: string }>;
  parameters?: Array<{
    label?: Record<string, string>;
    value?: Record<string, string>;
  }>;
  category?: { _ref?: string; title?: string };
  moqQuantity?: number;
  moqUnit?: Record<string, string>;
  packaging?: Record<string, string>;
  cartonQty?: number;
  powerSupply?: Record<string, string>;
  isPublished?: boolean;
  sortOrder?: number;
  colors?: unknown;
};

const query = `*[_type == "product" && sku == $sku][0]{_id,sku,name,images[]{url},parameters[]{label,value},category->{_id,title,slug},moqQuantity,moqUnit,packaging,cartonQty,powerSupply,isPublished,sortOrder,colors}`;

export const mapRomikuSanityRecord = (
  record: unknown,
): SanityProductMatch | null => {
  const value = record as SanityRecord;
  if (!value?._id || !value.sku) return null;
  return {
    sanityProductId: value._id,
    sku: value.sku,
    title: value.name?.en ?? value.name?.zh,
    imageUrl: value.images?.[0]?.url,
    parameters: value.parameters,
    category: value.category,
    moqQuantity: value.moqQuantity,
    moqUnit: value.moqUnit,
    packaging: value.packaging,
    cartonQty: value.cartonQty,
    powerSupply: value.powerSupply,
    isPublished: value.isPublished,
    sortOrder: value.sortOrder,
    colors: value.colors,
  };
};

export const createRomikuSanityProductSource = () =>
  createSanityProductSource({
    lookupBySku: async (sku) => {
      const endpoint = `https://${romikuSanityConfig.projectId}.api.sanity.io/v${romikuSanityConfig.apiVersion}/data/query/${romikuSanityConfig.dataset}`;
      const response = await fetch(
        `${endpoint}?query=${encodeURIComponent(query)}&$sku=${encodeURIComponent(JSON.stringify(sku))}`,
      );
      if (!response.ok)
        throw new Error(`Sanity request failed: ${response.status}`);
      const body = (await response.json()) as { result?: unknown };
      return body.result ?? null;
    },
    mapRecord: mapRomikuSanityRecord,
  });
