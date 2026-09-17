import type { RaRecord } from "ra-core";

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
  if (!path) throw new Error("Unsupported source record.");
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
    label: "Outbound company",
    resource: "romiku_outbound_companies",
  },
  formal_customer_id: {
    label: "Formal Customer",
    resource: "romiku_formal_customers",
  },
  quote_id: { label: "Quote", resource: "romiku_quotes" },
  pi_id: { label: "PI", resource: "romiku_pis" },
  order_id: { label: "Order", resource: "romiku_orders" },
  production_order_id: {
    label: "Production Order",
    resource: "romiku_production_orders",
  },
  supplier_id: { label: "Supplier", resource: "romiku_suppliers" },
};
export type TaskSource = keyof typeof taskSources;
export function taskWrite(
  values: Record<string, unknown>,
  relation: string,
  sourceId: string,
) {
  const title = String(values.title || "").trim();
  if (!title) throw new Error("Task title is required.");
  if (!["low", "normal", "high", "urgent"].includes(String(values.priority)))
    throw new Error("Choose a valid priority.");
  if (relation && (!(relation in taskSources) || !sourceId))
    throw new Error("Choose a supported source record.");
  const due = values.due_at ? new Date(String(values.due_at)) : null;
  if (due && Number.isNaN(due.getTime()))
    throw new Error("Choose a valid due date.");
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
