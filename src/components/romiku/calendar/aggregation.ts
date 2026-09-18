import type { RaRecord } from "ra-core";
import { taskSourceLabel } from "../relationshipLabels";

export type SourceEvent = RaRecord & {
  event_type: string;
  source_table: string;
  source_id: string;
  title: string;
  due_at?: string | null;
  owner_id?: string | null;
  status: string;
};
const paths: Record<string, string> = {
  romiku_website_inquiries: "/website-inquiries?record=",
  romiku_outbound_companies: "/outbound-development?record=",
  romiku_formal_customers: "/formal-customers?record=",
  romiku_quotes: "/quotes/",
  romiku_pis: "/pi/",
  romiku_orders: "/orders/",
  romiku_production_orders: "/production/",
  romiku_packing_lists: "/packing-shipping/",
  romiku_manual_tasks: "/calendar/tasks/",
  romiku_suppliers: "/romiku_suppliers/",
};
export function sourceHref(table: string, id: string) {
  const path = paths[table];
  if (!path) throw new Error("不支持的来源记录。");
  return `${path}${encodeURIComponent(id)}`;
}
export function localDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function calendarEvents(
  events: SourceEvent[],
  owner: string,
  from: string,
  to: string,
) {
  return events
    .filter((event) => {
      const day = event.due_at ? localDay(new Date(event.due_at)) : "";
      return (
        (!owner || event.owner_id === owner) &&
        !!day &&
        (!from || day >= from) &&
        (!to || day <= to)
      );
    })
    .sort(
      (a, b) =>
        Date.parse(a.due_at!) - Date.parse(b.due_at!) ||
        String(a.id).localeCompare(String(b.id)),
    );
}
export const taskSources = {
  outbound_company_id: {
    label: taskSourceLabel("outbound_company_id"),
    resource: "romiku_outbound_companies",
  },
  formal_customer_id: {
    label: taskSourceLabel("formal_customer_id"),
    resource: "romiku_formal_customers",
  },
  quote_id: { label: taskSourceLabel("quote_id"), resource: "romiku_quotes" },
  pi_id: { label: taskSourceLabel("pi_id"), resource: "romiku_pis" },
  order_id: { label: taskSourceLabel("order_id"), resource: "romiku_orders" },
  production_order_id: {
    label: taskSourceLabel("production_order_id"),
    resource: "romiku_production_orders",
  },
  supplier_id: {
    label: taskSourceLabel("supplier_id"),
    resource: "romiku_suppliers",
  },
};
export type TaskSource = keyof typeof taskSources;
export function taskWrite(
  values: Record<string, unknown>,
  relation: string,
  sourceId: string,
) {
  const title = String(values.title || "").trim();
  if (!title) throw new Error("任务标题为必填项。");
  if (!["low", "normal", "high", "urgent"].includes(String(values.priority)))
    throw new Error("请选择有效的优先级。");
  if (relation && (!(relation in taskSources) || !sourceId))
    throw new Error("请选择支持的关联记录。");
  const due = values.due_at ? new Date(String(values.due_at)) : null;
  if (due && Number.isNaN(due.getTime()))
    throw new Error("请选择有效的截止日期。");
  return {
    title,
    priority: values.priority,
    notes: String(values.notes || ""),
    due_at: due?.toISOString() || null,
    owner_id: values.owner_id || null,
    completed_at: values.completed_at || null,
    ...Object.fromEntries(
      Object.keys(taskSources).map((key) => [
        key,
        key === relation ? sourceId : null,
      ]),
    ),
  };
}
