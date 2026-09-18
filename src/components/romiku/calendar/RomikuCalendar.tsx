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
import {
  calendarEventLabel,
  relationshipStatusLabel,
} from "../relationshipLabels";

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
    mode === "list" ? [["全部日期", events] as const] : Object.entries(grouped);
  return (
    <section className="space-y-5">
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
      <p className="text-muted-foreground">
        此处汇总来源记录的跟进和到期日期。打开来源记录可修改日期；日历会在重新打开时及每分钟自动刷新。时间使用您的本地时区。
      </p>
      <OwnerFilter state={owner} />
      <div className="flex flex-wrap gap-3">
        <label>
          开始日期{" "}
          <input
            className="rounded border p-2"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          结束日期{" "}
          <input
            className="rounded border p-2"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label>
          视图{" "}
          <select
            aria-label="视图"
            className="rounded border p-2"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="dates">按日期</option>
            <option value="list">列表</option>
          </select>
        </label>
        <label>
          来源类型{" "}
          <select
            aria-label="来源类型"
            className="rounded border p-2"
            value={type}
            onChange={(e) => setType(e.target.value)}
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
        <Button
          variant="outline"
          onClick={() => {
            setFrom(localDay(today));
            setTo(localDay(today));
          }}
        >
          今天
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setFrom("");
            setTo("");
          }}
        >
          全部日期
        </Button>
      </div>
      {from && to && from > to && (
        <p role="alert">开始日期不得晚于结束日期。</p>
      )}
      {query.isPending && <p>正在加载日历…</p>}
      {query.error && (
        <p role="alert">
          无法加载日历。 <button onClick={() => query.refetch()}>重试</button>
        </p>
      )}
      {query.data && (
        <>
          <p className="text-sm">{events.length} 项日程</p>
          {rows.map(([date, items]) => (
            <section key={date} className="overflow-x-auto rounded border">
              <h2 className="bg-muted p-3 font-medium">{date}</h2>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {["来源", "事项", "日期／时间", "负责人", "状态"].map(
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
                        {calendarEventLabel(e.event_type)}
                      </td>
                      <td className="p-3">
                        {new Date(e.due_at!).toLocaleString("zh-CN")}
                      </td>
                      <td className="p-3">
                        {owner.owners.find((o) => o.user_id === e.owner_id)
                          ?.first_name || (e.owner_id ? "已分配" : "未分配")}
                      </td>
                      <td className="p-3">
                        {relationshipStatusLabel(e.status)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
          {!events.length && <p>当前选择中没有日程。</p>}
        </>
      )}
    </section>
  );
}
