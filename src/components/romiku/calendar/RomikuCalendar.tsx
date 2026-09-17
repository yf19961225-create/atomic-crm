import { useState } from "react";
import { Link } from "react-router";
import { useDataProvider } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { readRelated } from "../outbound/workflow";
import {
  calendarEvents,
  localDay,
  sourceHref,
  type SourceEvent,
} from "./aggregation";
import { OwnerFilter, useOwnerFilter } from "./OwnerFilter";

export function RomikuCalendar() {
  const provider = useDataProvider();
  const owner = useOwnerFilter();
  const today = new Date();
  const [from, setFrom] = useState(
    localDay(new Date(today.getFullYear(), today.getMonth(), 1)),
  );
  const [to, setTo] = useState(
    localDay(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
  );
  const [mode, setMode] = useState("dates");
  const [type, setType] = useState("");
  const query = useQuery({
    queryKey: ["romiku-calendar"],
    queryFn: async () =>
      (await readRelated(provider, "romiku_calendar", {})) as SourceEvent[],
    refetchOnMount: "always",
    refetchInterval: 60000,
  });
  const events = calendarEvents(
    query.data || [],
    owner.effectiveOwner,
    from,
    to,
  ).filter((e) => !type || e.source_table === type);
  const grouped: Record<string, SourceEvent[]> = {};
  for (const event of events)
    (grouped[localDay(new Date(event.due_at!))] ||= []).push(event);
  const rows =
    mode === "list"
      ? [["All dates", events] as const]
      : Object.entries(grouped);
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Calendar</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/calendar/tasks">Manual tasks</Link>
          </Button>
          <Button asChild>
            <Link to="/calendar/tasks/new">New manual task</Link>
          </Button>
          <Button variant="outline" onClick={() => query.refetch()}>
            Refresh
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground">
        Follow-ups and due dates from your source records. Open a source to
        change its date; this calendar refreshes automatically every minute and
        when reopened. Times use your local timezone.
      </p>
      <OwnerFilter state={owner} />
      <div className="flex flex-wrap gap-3">
        <label>
          From date{" "}
          <input
            className="rounded border p-2"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          To date{" "}
          <input
            className="rounded border p-2"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label>
          View{" "}
          <select
            aria-label="View"
            className="rounded border p-2"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="dates">By date</option>
            <option value="list">List</option>
          </select>
        </label>
        <label>
          Source type{" "}
          <select
            aria-label="Source type"
            className="rounded border p-2"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">All sources</option>
            {[
              ["romiku_website_inquiries", "Website"],
              ["romiku_outbound_companies", "Outbound"],
              ["romiku_quotes", "Quote"],
              ["romiku_pis", "PI"],
              ["romiku_orders", "Order"],
              ["romiku_production_orders", "Production"],
              ["romiku_packing_lists", "Packing"],
              ["romiku_manual_tasks", "Manual task"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          onClick={() => {
            setFrom(localDay(today));
            setTo(localDay(today));
          }}
        >
          Today
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setFrom("");
            setTo("");
          }}
        >
          All dates
        </Button>
      </div>
      {from && to && from > to && (
        <p role="alert">From date must be on or before To date.</p>
      )}
      {query.isPending && <p>Loading calendar…</p>}
      {query.error && (
        <p role="alert">
          Could not load calendar.{" "}
          <button onClick={() => query.refetch()}>Retry</button>
        </p>
      )}
      {query.data && (
        <>
          <p className="text-sm">{events.length} events</p>
          {rows.map(([date, items]) => (
            <section key={date} className="overflow-x-auto rounded border">
              <h2 className="bg-muted p-3 font-medium">{date}</h2>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {["Source", "Event", "Date / time", "Owner", "Status"].map(
                      (label) => (
                        <th key={label} className="p-3">
                          {label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {items?.map((e) => (
                    <tr key={e.id} className="border-t">
                      <td className="p-3">
                        <Link
                          className="underline"
                          to={sourceHref(e.source_table, e.source_id)}
                        >
                          {e.title}
                        </Link>
                      </td>
                      <td className="p-3">
                        {e.event_type.replaceAll("_", " ")}
                      </td>
                      <td className="p-3">
                        {new Date(e.due_at!).toLocaleString()}
                      </td>
                      <td className="p-3">
                        {owner.owners.find((o) => o.user_id === e.owner_id)
                          ?.first_name ||
                          (e.owner_id ? "Assigned" : "Unassigned")}
                      </td>
                      <td className="p-3">{e.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
          {!events.length && <p>No events in this selection.</p>}
        </>
      )}
    </section>
  );
}
