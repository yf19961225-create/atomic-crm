import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useDataProvider } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin, {
  type DateClickArg,
} from "@fullcalendar/interaction";
import type { CalendarOptions, EventInput } from "@fullcalendar/core";
import { Button } from "@/components/ui/button";
import { readRelated } from "../outbound/workflow";
import { OwnerFilter, useOwnerFilter } from "./OwnerFilter";
import { calendarEvents, sourceHref, type SourceEvent } from "./aggregation";

export const calendarOptions: Pick<
  CalendarOptions,
  "plugins" | "initialView" | "firstDay" | "headerToolbar" | "dayMaxEvents"
> = {
  plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
  initialView: "dayGridMonth",
  firstDay: 1,
  headerToolbar: {
    left: "prev,next today",
    center: "title",
    right: "dayGridMonth,timeGridWeek,timeGridDay",
  },
  dayMaxEvents: true,
};

export function calendarEventInput(event: SourceEvent): EventInput {
  return {
    id: String(event.id),
    title: event.title,
    start: event.due_at || undefined,
    allDay: Boolean(event.all_day),
    url: sourceHref(event.source_table, event.source_id),
    extendedProps: {
      sourceType: event.source_table,
      eventType: event.event_type,
    },
  };
}

function localDateTime(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function RomikuCalendar() {
  const provider = useDataProvider();
  const navigate = useNavigate();
  const owner = useOwnerFilter();
  const [type, setType] = useState("");
  const query = useQuery({
    queryKey: ["romiku-calendar"],
    queryFn: async () =>
      (await readRelated(provider, "romiku_calendar", {})) as SourceEvent[],
    refetchOnMount: "always",
    refetchInterval: 60000,
  });
  const events = useMemo(
    () =>
      calendarEvents(query.data || [], owner.effectiveOwner, "", "")
        .filter((event) => !type || event.source_table === type)
        .map(calendarEventInput),
    [query.data, owner.effectiveOwner, type],
  );
  const dateClick = (arg: DateClickArg) =>
    navigate(
      `/calendar/tasks/new?due=${encodeURIComponent(localDateTime(arg.date))}`,
    );
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">日历</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/calendar/tasks">手动任务</Link>
          </Button>
          <Button asChild>
            <Link to="/calendar/tasks/new">新建手动任务</Link>
          </Button>
          <Button variant="outline" onClick={() => query.refetch()}>
            刷新
          </Button>
        </div>
      </div>
      <OwnerFilter state={owner} />
      <label className="inline-flex items-center gap-2">
        来源类型
        <select
          aria-label="来源类型"
          className="rounded border p-2"
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="">全部来源</option>
          {[
            ["romiku_website_inquiries", "网站询盘"],
            ["romiku_outbound_companies", "外贸开发"],
            ["romiku_quotes", "报价单"],
            ["romiku_pis", "形式发票"],
            ["romiku_orders", "订单"],
            ["romiku_production_orders", "生产"],
            ["romiku_packing_lists", "装箱"],
            ["romiku_manual_tasks", "手动任务"],
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {query.isPending && <p>正在加载日历…</p>}
      {query.error && (
        <p role="alert">
          无法加载日历。 <button onClick={() => query.refetch()}>重试</button>
        </p>
      )}
      {query.data && (
        <div className="rounded border bg-background p-3">
          <FullCalendar
            {...calendarOptions}
            events={events}
            dateClick={dateClick}
            eventClick={(info) => {
              info.jsEvent.preventDefault();
              const event = query.data?.find(
                (item) => String(item.id) === info.event.id,
              );
              if (event)
                navigate(sourceHref(event.source_table, event.source_id));
            }}
            eventContent={(arg) => (
              <span title={arg.event.extendedProps.eventType}>
                {arg.timeText ? `${arg.timeText} ` : ""}
                {arg.event.title}
              </span>
            )}
          />
        </div>
      )}
      {query.data && (
        <p className="text-sm text-muted-foreground">
          共 {events.length}{" "}
          项日程。点击空白日期新建任务，点击任务打开来源记录。
        </p>
      )}
    </section>
  );
}
