import { buildActions } from "./actions";
import {
  calendarEvents,
  sourceHref,
  taskWrite,
  type SourceEvent,
} from "../calendar/aggregation";

const now = new Date("2026-09-17T12:00:00Z");
it("prioritizes overdue new inquiries without counting them twice", () => {
  const rows = buildActions(
    {
      romiku_website_inquiries: [
        { id: "new", document_number: "WI-new", status: "new" },
        {
          id: "late",
          document_number: "WI-late",
          status: "new",
          next_follow_up_at: "2026-09-01T10:00:00Z",
        },
      ],
      romiku_manual_tasks: [
        { id: "urgent", title: "Urgent task", priority: "urgent" },
      ],
    },
    now,
  );
  expect(rows.map((r) => r.source_id)).toEqual(["late", "urgent", "new"]);
  expect(rows.filter((r) => r.group === "website_new")).toHaveLength(2);
});
it("excludes archived or completed work and caps deposit at the actual remaining receivable", () => {
  const actions = buildActions(
    {
      romiku_quotes: [{ id: "q", status: "sent", archived_at: "2026-09-01" }],
      romiku_pis: [{ id: "p", status: "confirmed" }],
      romiku_manual_tasks: [{ id: "done", completed_at: "2026-09-01" }],
      romiku_order_totals: [
        {
          id: "o",
          document_number: "O-1",
          remaining_amount: 20,
          deposit_remaining: 30,
          currency: "USD",
        },
      ],
    },
    now,
  );
  expect(actions).toHaveLength(1);
  expect(actions[0]).toMatchObject({ group: "deposit", amount: 20 });
});
it("excludes cancelled order-delivery events from the workbench feed", () => {
  const actions = buildActions(
    {
      romiku_workbench: [
        {
          id: "order_delivery:open",
          source_id: "open",
          event_type: "order_delivery",
          source_table: "romiku_orders",
          title: "Open order",
          status: "confirmed",
          due_at: "2026-09-20T10:00:00Z",
        },
        {
          id: "order_delivery:cancelled",
          source_id: "cancelled",
          event_type: "order_delivery",
          source_table: "romiku_orders",
          title: "Cancelled order",
          status: "cancelled",
          due_at: "2026-09-20T10:00:00Z",
        },
      ],
    },
    now,
  );

  expect(actions.map((action) => action.source_id)).toEqual(["open"]);
});
it("keeps unresolved production anomalies actionable after completion without duplicates", () => {
  const actions = buildActions(
    {
      romiku_workbench: [
        {
          id: "production_anomaly:active",
          source_id: "active",
          event_type: "production_anomaly",
          source_table: "romiku_production_orders",
          title: "Active production",
          status: "in_production",
          due_at: "2026-09-20T10:00:00Z",
        },
        {
          id: "production_anomaly:completed",
          source_id: "completed",
          event_type: "production_anomaly",
          source_table: "romiku_production_orders",
          title: "Completed production",
          status: "completed",
          due_at: "2026-09-20T10:00:00Z",
        },
        {
          id: "production_anomaly:received",
          source_id: "received",
          event_type: "production_anomaly",
          source_table: "romiku_production_orders",
          title: "Received production",
          status: "received",
          due_at: "2026-09-20T10:00:00Z",
        },
        {
          id: "production_anomaly:cancelled",
          source_id: "cancelled",
          event_type: "production_anomaly",
          source_table: "romiku_production_orders",
          title: "Cancelled production with unresolved anomaly",
          status: "cancelled",
          due_at: "2026-09-20T10:00:00Z",
        },
      ],
      romiku_production_orders: [
        {
          id: "active",
          status: "in_production",
          factory_due_at: "2026-09-20T10:00:00Z",
          anomaly_flags: ["delay"],
        },
        {
          id: "completed",
          status: "completed",
          anomaly_flags: ["quality"],
        },
        {
          id: "received",
          status: "received",
          anomaly_flags: ["quantity"],
        },
        {
          id: "cancelled",
          status: "cancelled",
          anomaly_flags: ["supplier_dispute"],
        },
        { id: "cleared", status: "completed", anomaly_flags: [] },
      ],
    },
    now,
  );

  const production = actions.filter((action) => action.group === "production");
  expect(production.map((action) => action.source_id).sort()).toEqual([
    "active",
    "cancelled",
    "completed",
    "received",
  ]);
  expect(production.every((action) => action.urgent)).toBe(true);
});
it.each([
  ["romiku_website_inquiries", "/website-inquiries?record=a%2Fb"],
  ["romiku_outbound_companies", "/outbound-development?record=a%2Fb"],
  ["romiku_quotes", "/quotes/a%2Fb"],
  ["romiku_pis", "/pi/a%2Fb"],
  ["romiku_orders", "/orders/a%2Fb"],
  ["romiku_production_orders", "/production/a%2Fb"],
  ["romiku_packing_lists", "/packing-shipping/a%2Fb"],
  ["romiku_manual_tasks", "/calendar/tasks/a%2Fb"],
])("resolves %s events to the exact source page", (table, href) => {
  expect(sourceHref(table, "a/b")).toBe(href);
});
it("filters inclusive local calendar dates and keeps two events for distinct dates on one source", () => {
  const common = {
    source_table: "romiku_quotes",
    source_id: "q",
    title: "Q",
    owner_id: "one",
    status: "sent",
  };
  const events: SourceEvent[] = [
    {
      ...common,
      id: "quote_due:q",
      event_type: "quote_due",
      due_at: "2026-09-17T23:59:00",
    },
    {
      ...common,
      id: "quote_follow_up:q",
      event_type: "quote_follow_up",
      due_at: "2026-09-17T00:00:00",
    },
    {
      ...common,
      id: "other",
      event_type: "quote_due",
      owner_id: "two",
      due_at: "2026-09-17T12:00:00",
    },
    {
      ...common,
      id: "tomorrow",
      event_type: "quote_due",
      due_at: "2026-09-18T00:00:00",
    },
  ];
  expect(
    calendarEvents(events, "one", "2026-09-17", "2026-09-17").map((e) => e.id),
  ).toEqual(["quote_follow_up:q", "quote_due:q"]);
});
it("rejects unsupported manual task relations and clears the previous relationship on relinking", () => {
  expect(() =>
    taskWrite({ title: "Call", priority: "normal" }, "inquiry_id", "i"),
  ).toThrow("supported source");
  expect(() =>
    taskWrite({ title: "Call", priority: "normal" }, "quote_id", ""),
  ).toThrow("supported source");
  expect(
    taskWrite(
      { title: "Call", priority: "normal", quote_id: "old" },
      "order_id",
      "new",
    ),
  ).toMatchObject({ quote_id: null, order_id: "new", due_at: null });
});
