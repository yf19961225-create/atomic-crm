import type { RaRecord } from "ra-core";

export const searchTypes = [
  "formal_customer",
  "outbound",
  "website_inquiry",
  "quote",
  "pi",
  "order",
  "production",
  "packing",
] as const;
export type SearchType = (typeof searchTypes)[number];
export type SearchItem = {
  id: string;
  title: string;
  subtitle: string;
  matched_fields: string[];
  rank: number;
};
export type SearchGroup = {
  resource_type: SearchType;
  total_count: number;
  limit: number;
  offset: number;
  has_more: boolean;
  items: SearchItem[];
};
export type SearchResponse = { groups: SearchGroup[] };
export type SearchFilters = {
  status?: string;
  order_id?: string;
  formal_customer_id?: string;
};
export type SearchArgs = {
  query: string;
  resource_types: SearchType[] | null;
  limit: number;
  offset: number;
  filters: SearchFilters;
};
type Rpc = (
  name: string,
  args: SearchArgs,
) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
type GetMany = (
  resource: string,
  params: { ids: string[] },
) => Promise<{ data: RaRecord[] }>;

export async function searchBusinessRecords(
  rpc: Rpc,
  args: SearchArgs,
): Promise<SearchResponse> {
  const { data, error } = await rpc("romiku_global_search", {
    ...args,
    query: args.query.trim(),
  });
  if (error) throw new Error("搜索失败，请重试。");
  if (
    !data ||
    typeof data !== "object" ||
    !Array.isArray((data as SearchResponse).groups)
  )
    throw new Error("搜索结果格式无效，请重试。");
  return data as SearchResponse;
}

export async function hydrateSearchPage(
  getMany: GetMany,
  resource: string,
  group: SearchGroup,
): Promise<RaRecord[]> {
  if (!group.items.length) return [];
  const ids = group.items.map((item) => item.id);
  const { data } = await getMany(resource, { ids });
  const byId = new Map(data.map((record) => [String(record.id), record]));
  return group.items.flatMap((item) => {
    const record = byId.get(item.id);
    return record ? [record] : [];
  });
}

export function searchPath(type: SearchType, id: string): string {
  const path: Record<SearchType, string> = {
    formal_customer: "/formal-customers?record=",
    outbound: "/outbound-development?record=",
    website_inquiry: "/website-inquiries?record=",
    quote: "/quotes/",
    pi: "/pi/",
    order: "/orders/",
    production: "/production/",
    packing: "/packing-shipping/",
  };
  return path[type] + encodeURIComponent(id);
}

export const searchLabels: Record<SearchType, string> = {
  formal_customer: "正式客户",
  outbound: "外贸开发",
  website_inquiry: "网站询盘",
  quote: "报价单",
  pi: "PI",
  order: "订单",
  production: "生产单",
  packing: "装箱单",
};

export function matchedFieldLabel(field: string): string {
  const value = field.toLowerCase();
  if (value.startsWith("source_")) return "来源信息";
  if (/sku/.test(value)) return "产品 SKU";
  if (/customer_code|item|product|specification/.test(value)) return "产品信息";
  if (/phone|whatsapp|email|contact/.test(value)) return "联系方式";
  if (/company|customer|counterparty|buyer|seller|business|brand/.test(value))
    return "客户信息";
  if (/source/.test(value)) return "来源信息";
  if (/document_number|order_number|number/.test(value)) return "单据编号";
  if (/address|country|region|city/.test(value)) return "地址信息";
  if (/status/.test(value)) return "状态";
  if (/note|message|requirement/.test(value)) return "业务备注";
  return "业务信息";
}
