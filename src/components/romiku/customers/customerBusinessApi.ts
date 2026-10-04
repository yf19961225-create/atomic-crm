import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
export type BusinessKind = "quote" | "pi" | "order" | "production" | "packing";
export type DocumentLink = {
  id: string;
  document_number: string;
  customer_conflict?: boolean;
  matched?: boolean;
};
export type CustomerDocument = DocumentLink & {
  resource_type: BusinessKind;
  document_date: string;
  status?: string;
  currency?: string;
  total?: number;
  order_id?: string;
  order_number?: string;
  related_orders?: DocumentLink[];
  archived_at?: string;
};
export type OrderCard = CustomerDocument & {
  source_quotes: DocumentLink[];
  source_pi: DocumentLink | null;
  productions: DocumentLink[];
  packings: DocumentLink[];
  payments: {
    id: string;
    kind: string;
    amount: number;
    received_at: string;
    payment_reference?: string;
  }[];
  payment_summary: { total: number; paid: number; balance: number };
};
export type HistoryResponse = {
  total_count: number;
  has_more: boolean;
  orders: OrderCard[];
  summary: {
    order_count: number;
    in_progress: number;
    completed: number;
    totals: { currency: string; amount: number }[];
    latest: (DocumentLink & { document_date: string }) | null;
  };
};
export type DocumentsResponse = {
  total_count: number;
  has_more: boolean;
  items: CustomerDocument[];
};
export type ArchivePlan = {
  token: string;
  documents: (DocumentLink & {
    resource_type: BusinessKind;
    formal_customer_id: string | null;
  })[];
};
export async function customerRpc<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await getSupabaseClient().rpc(name, args);
  if (error) {
    const messages: Record<string, string> = {
      "40001": "来源或客户关联已变化，请重新预览后确认。",
      "23514": "来源链已有其他客户关联，归档未执行。",
      "42501": "记录不存在或无权访问，操作未执行。",
      "22023": "输入无效，请检查后重试。",
    };
    throw new Error(messages[error.code] || "客户业务记录操作失败，请重试。");
  }
  if (!data || typeof data !== "object")
    throw new Error("客户业务记录返回无效，请重试。");
  return data as T;
}
export const money = (value: number, currency: string) =>
  `${currency} ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
