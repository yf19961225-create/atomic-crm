import type { RaRecord } from "ra-core";
import type { SourceEvent } from "../calendar/aggregation";

export const actionGroups = {
  website_new: "New Website inquiries",
  website_pending: "Pending Website inquiries / follow-ups",
  outbound: "Outbound follow-ups",
  outbound_overdue: "Overdue Outbound follow-ups",
  quote: "Pending Quotes",
  pi: "Pending PI",
  deposit: "Deposit receivable",
  balance: "Balance receivable",
  production: "Production / due",
  packing: "Packing / shipping",
  delivery: "Order delivery",
  task: "Manual tasks",
};
export type ActionGroup = keyof typeof actionGroups;
export type Action = SourceEvent & {
  group: ActionGroup;
  urgent?: boolean;
  amount?: number;
  currency?: string;
};
export type ActionData = Record<string, RaRecord[]>;
export const actionResources = [
  "romiku_workbench",
  "romiku_website_inquiries",
  "romiku_quotes",
  "romiku_pis",
  "romiku_order_totals",
  "romiku_production_orders",
  "romiku_packing_lists",
  "romiku_manual_tasks",
];
export const isOverdue = (event: SourceEvent, now: Date) =>
  !!event.due_at && Date.parse(event.due_at) < now.getTime();
export function buildActions(data: ActionData, now = new Date()): Action[] {
  const actions: Action[] = [];
  const add = (
    record: RaRecord,
    resource: string,
    group: ActionGroup,
    due?: string | null,
    extra: Partial<Action> = {},
  ) =>
    actions.push({
      id: `${group}:${record.id}`,
      source_id: String(record.id),
      source_table: resource,
      title: record.document_number || record.title || record.name,
      owner_id: record.owner_id,
      status: record.status || "pending",
      due_at: due,
      event_type: group,
      group,
      ...extra,
    });
  const active = (resource: string) =>
    (data[resource] || []).filter((r) => !r.archived_at);
  for (const r of active("romiku_website_inquiries")) {
    if (r.status === "new")
      add(r, "romiku_website_inquiries", "website_new", r.next_follow_up_at);
    if (["pending", "following_up"].includes(r.status))
      add(
        r,
        "romiku_website_inquiries",
        "website_pending",
        r.next_follow_up_at,
      );
  }
  for (const raw of data.romiku_workbench || []) {
    const e = raw as SourceEvent;
    if (e.event_type === "outbound_follow_up")
      actions.push({
        ...e,
        group: isOverdue(e, now) ? "outbound_overdue" : "outbound",
      });
    if (e.event_type === "order_delivery" && e.status !== "cancelled")
      actions.push({ ...e, group: "delivery" });
    if (
      e.event_type === "production_anomaly" &&
      ["completed", "received", "cancelled"].includes(e.status)
    )
      actions.push({ ...e, group: "production", urgent: true });
  }
  for (const [resource, group] of [
    ["romiku_quotes", "quote"],
    ["romiku_pis", "pi"],
  ] as const) {
    for (const r of active(resource))
      if (["draft", "sent"].includes(r.status)) {
        const dates = [r.follow_up_at, r.due_at].filter(Boolean).sort();
        add(r, resource, group, dates[0]);
      }
  }
  for (const r of active("romiku_order_totals")) {
    if (r.status === "cancelled" || Number(r.remaining_amount) <= 0) continue;
    const deposit = Math.min(
      Number(r.deposit_remaining),
      Number(r.remaining_amount),
    );
    if (deposit > 0)
      add(r, "romiku_orders", "deposit", r.deposit_due_at, {
        amount: deposit,
        currency: r.currency,
      });
    const balance = Math.max(Number(r.remaining_amount) - deposit, 0);
    if (balance > 0)
      add(r, "romiku_orders", "balance", r.balance_due_at, {
        amount: balance,
        currency: r.currency,
      });
  }
  for (const r of active("romiku_production_orders"))
    if (!["completed", "received", "cancelled"].includes(r.status))
      add(r, "romiku_production_orders", "production", r.factory_due_at, {
        urgent: !!r.anomaly_flags?.length,
      });
  for (const r of active("romiku_packing_lists"))
    add(r, "romiku_packing_lists", "packing", r.packing_at);
  for (const r of active("romiku_manual_tasks"))
    if (!r.completed_at)
      add(r, "romiku_manual_tasks", "task", r.due_at, {
        urgent: ["urgent", "high"].includes(r.priority),
      });
  return actions.sort((a, b) => {
    const rank = (x: Action) =>
      isOverdue(x, now)
        ? 0
        : x.urgent
          ? 1
          : x.group === "website_new"
            ? 2
            : x.due_at
              ? 3
              : 4;
    return (
      rank(a) - rank(b) ||
      (a.due_at ? Date.parse(a.due_at) : Infinity) -
        (b.due_at ? Date.parse(b.due_at) : Infinity) ||
      String(a.id).localeCompare(String(b.id))
    );
  });
}
