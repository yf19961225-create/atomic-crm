import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import type { QueryClient } from "@tanstack/react-query";
export type CollectionSnapshot = {
  amounts: {
    total: number;
    remaining: number;
    deposit_percent: number;
    deposit_remaining: number;
    status: string;
    currency?: string;
    archived_at?: string | null;
  };
  payments: { id: string; amount: number }[];
  state: {
    customer_confirmation: string;
    deposit_override: string;
    revision: number;
    needs_follow_up?: boolean;
    next_follow_up_on?: string | null;
  };
  fingerprint: string;
};
export type DueSnapshot = {
  id: string;
  document_number: string;
  factory_due_at: string | null;
  classification: string;
  revision: number;
  needs_follow_up: boolean;
  next_follow_up_on: string | null;
};
export type WorkItem = {
  id: string;
  kind: string;
  source_table: string;
  source_id: string;
  title: string;
  document_number: string;
  status: string;
  due: string | null;
  amount?: number;
  currency?: string;
  child_count?: number;
  children?: DueSnapshot[];
};
export type Feed = {
  rows: WorkItem[];
  total: number;
  counts: Record<string, number>;
  unknown_total: number;
  potential_receivables: { currency: string; amount: number }[];
  raw_count: number;
};
export async function workbenchRpc<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await getSupabaseClient().rpc(name, args);
  if (error)
    throw new Error(
      /STALE|CONFLICT|40001/.test(`${error.code} ${error.message}`)
        ? "记录已被修改，请刷新后核对并重新操作。"
        : /FORBIDDEN|42501/.test(`${error.code} ${error.message}`)
          ? "没有操作权限或账号已停用。"
          : error.message || "操作未完成，请核对后重试。",
    );
  if (data == null) throw new Error("未收到服务器确认，请使用原请求重试。");
  return data as T;
}
export async function refreshWorkbench(cache: QueryClient) {
  await cache.invalidateQueries();
  if (typeof BroadcastChannel !== "undefined") {
    const c = new BroadcastChannel("romiku-workbench");
    c.postMessage("refresh");
    c.close();
  }
}
