import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useDataProvider } from "ra-core";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { readRelated } from "../outbound/workflow";
import { sourceHref } from "../calendar/aggregation";
import { OwnerFilter, useOwnerFilter } from "../calendar/OwnerFilter";
import {
  actionGroups,
  actionResources,
  buildActions,
  isOverdue,
} from "./actions";

export function RomikuWorkbench() {
  const provider = useDataProvider();
  const owner = useOwnerFilter();
  const [params, setParams] = useSearchParams();
  const selected = params.get("action") || "";
  const [limit, setLimit] = useState(50);
  const query = useQuery({
    queryKey: ["romiku-action-center"],
    queryFn: async () =>
      Object.fromEntries(
        await Promise.all(
          actionResources.map(async (resource) => [
            resource,
            await readRelated(provider, resource, {}),
          ]),
        ),
      ),
    refetchOnMount: "always",
    refetchInterval: 60000,
  });
  const now = new Date();
  const actions = buildActions(query.data || {}, now).filter(
    (a) => !owner.effectiveOwner || a.owner_id === owner.effectiveOwner,
  );
  const shown = actions.filter((a) => !selected || a.group === selected);
  const choose = (group: string) => {
    setParams(group ? { action: group } : {});
    setLimit(50);
  };
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">ROMIKU CRM 2.0</p>
          <h1 className="text-3xl font-semibold">工作台</h1>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/calendar">日历</Link>
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
        待办中心 ·
        按逾期、紧急、新询盘和临近日期排序。网站询盘和外贸开发分别统计。
      </p>
      <OwnerFilter state={owner} />
      {query.isPending && <p>正在加载待办事项…</p>}
      {query.error && (
        <p role="alert">
          无法加载全部待办事项。{" "}
          <button onClick={() => query.refetch()}>重试</button>
        </p>
      )}
      {query.data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(actionGroups).map(([group, title]) => {
              const count = actions.filter((a) => a.group === group).length;
              return (
                <button
                  key={group}
                  aria-label={`${title}: ${count}`}
                  aria-pressed={selected === group}
                  className={`rounded-lg border p-4 text-left ${selected === group ? "border-primary bg-muted" : "hover:bg-muted/50"}`}
                  onClick={() => choose(group)}
                >
                  <span className="text-sm">{title}</span>
                  <strong className="mt-2 block text-3xl">{count}</strong>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-medium">优先待办</h2>
            <Button variant="outline" onClick={() => choose("")}>
              全部待办
            </Button>
            <span className="text-sm">{shown.length} 项待办</span>
          </div>
          <div className="overflow-x-auto rounded border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  {["来源", "事项", "截止时间", "优先级", "金额"].map((t) => (
                    <th className="p-3" key={t}>
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, limit).map((action) => (
                  <tr className="border-t" key={action.id}>
                    <td className="p-3">
                      <Link
                        className="underline"
                        to={sourceHref(action.source_table, action.source_id)}
                      >
                        {action.title}
                      </Link>
                    </td>
                    <td className="p-3">{actionGroups[action.group]}</td>
                    <td className="p-3">
                      {action.due_at
                        ? new Date(action.due_at).toLocaleString()
                        : "未安排"}
                    </td>
                    <td className="p-3">
                      {isOverdue(action, now)
                        ? "已逾期"
                        : action.urgent
                          ? "紧急"
                          : "待处理"}
                    </td>
                    <td className="p-3">
                      {action.amount !== undefined
                        ? `${action.currency} ${action.amount.toFixed(2)}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!shown.length && <p className="p-6">当前选择中没有待办事项。</p>}
          </div>
          {shown.length > limit && (
            <Button variant="outline" onClick={() => setLimit(limit + 50)}>
              Show more actions
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Counts are actionable records per category. An Order can have both
            deposit and balance outstanding. Packing lists stay here until
            archived. Completed tasks remain available in Calendar → Manual
            tasks.
          </p>
        </>
      )}
    </section>
  );
}
