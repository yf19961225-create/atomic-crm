import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { safeRollbackEnabled } from "./rollbackPolicy";
import { WorkbenchMaintenance } from "./WorkbenchMaintenance";
import { workbenchRpc, type Feed } from "./workbenchApi";
import { CollectionControls } from "./CollectionControls";
import { ProductionDueControls, dueLabels } from "./ProductionDueControls";
import { useWorkbenchRefresh } from "./useWorkbenchRefresh";
import { sourceHref } from "../calendar/aggregation";
import { RecordDelete } from "../shared/RecordDelete";
const tabs = {
  recent: "近期重点",
  collection: "待收款",
  arrange: "待安排",
  all: "全部待办",
};
const kinds: Record<string, string> = {
  collection: "收款",
  verification: "客户确认待核实",
  deferred: "客户未确认 / 草稿",
  production: "生产交期",
  inquiry: "网站询盘",
  quote: "报价单",
  pi: "PI",
  packing: "装箱发运",
  task: "手动任务",
  outbound_follow_up: "外贸跟进",
  order_delivery: "订单交付",
  production_anomaly: "生产异常",
};
const statuses: Record<string, string> = {
  deposit: "待收定金",
  balance: "待收尾款",
  prepayment: "一次性应收",
  unknown: "待核实",
  unconfirmed: "客户未确认",
  draft: "草稿",
  needs_action: "待安排",
  scheduled: "已分类",
};
export function RomikuWorkbench() {
  return safeRollbackEnabled() ? (
    <WorkbenchMaintenance />
  ) : (
    <ControlledWorkbench />
  );
}
function ControlledWorkbench() {
  useWorkbenchRefresh();
  const [tab, setTab] = useState<keyof typeof tabs>("recent"),
    [search, setSearch] = useState(""),
    [kind, setKind] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(0);
  const size = tab === "recent" ? 8 : 20;
  const query = useQuery({
    queryKey: ["workbench-feed", tab, search, kind, status, page, size],
    queryFn: () =>
      workbenchRpc<Feed>("romiku_workbench_feed", {
        p_tab: tab,
        p_search: search,
        p_kind: kind,
        p_status: status,
        p_limit: size,
        p_offset: page * size,
      }),
  });
  const data = query.data;
  function choose(t: keyof typeof tabs, k = "") {
    setTab(t);
    setKind(k);
    setStatus("");
    setSearch("");
    setPage(0);
  }
  return (
    <section className="space-y-4 min-w-0">
      <div className="flex flex-wrap justify-between gap-3">
        <h1 className="text-3xl font-semibold">工作台</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/calendar">日历</Link>
          </Button>
          <Button asChild>
            <Link to="/calendar/tasks/new">新建手动任务</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => query.refetch()}
          >
            刷新
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Object.entries(tabs).map(([key, label]) => (
          <Button
            key={key}
            variant={tab === key ? "default" : "outline"}
            aria-pressed={tab === key}
            onClick={() => choose(key as keyof typeof tabs)}
          >
            {label} {data?.counts[key] ?? "—"}
          </Button>
        ))}
      </div>
      {data && (
        <aside className="rounded border border-amber-300 p-3">
          <Button variant="link" onClick={() => choose("all", "verification")}>
            客户确认待核实：{data.unknown_total} 张订单
          </Button>
          <p>
            潜在应收：
            {data.potential_receivables
              .map((x) => `${x.currency} ${Number(x.amount).toFixed(2)}`)
              .join("；") || "—"}
            。核实前不生成常规催款，不代表已结清。
          </p>
          <Button variant="link" onClick={() => choose("all", "deferred")}>
            查看客户未确认 / 草稿有余额
          </Button>
        </aside>
      )}
      <div className="flex flex-wrap gap-3">
        <label>
          搜索
          <input
            className="ml-2 max-w-full rounded border p-2"
            aria-label="搜索待办"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="单据名称、编号"
          />
        </label>
        <label>
          来源类型
          <select
            aria-label="来源类型"
            className="ml-2 rounded border p-2"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(0);
            }}
          >
            <option value="">全部</option>
            {Object.entries(kinds).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          状态
          <input
            aria-label="筛选状态"
            className="ml-2 w-32 rounded border p-2"
            value={status}
            placeholder="状态代码"
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          />
        </label>
      </div>
      {tab === "recent" && (
        <p className="text-sm text-muted-foreground">
          上海业务日期：今天及随后 6 天，另含逾期及明确需跟进事项。每页最多 8
          条。
        </p>
      )}
      {query.isPending && <p>正在加载待办…</p>}
      {query.error && <p role="alert">加载失败：{query.error.message}</p>}
      {data && (
        <>
          <p>
            {data.total} 项待办 · 显示 {data.rows.length} 项；全部{" "}
            {data.counts.all} 项汇总 / {data.raw_count} 个原始事项
          </p>
          <div className="space-y-3">
            {data.rows.map((item) => (
              <article className="rounded border p-4 min-w-0" key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 break-words">
                    <Link
                      className="font-semibold underline"
                      to={sourceHref(item.source_table, item.source_id)}
                    >
                      {item.title}
                    </Link>
                    <p className="text-sm">
                      {kinds[item.kind] || item.kind} ·{" "}
                      {statuses[item.status] || item.status} ·{" "}
                      {item.due || "未安排日期"}
                    </p>
                    {item.amount != null && (
                      <p>
                        {item.currency} {Number(item.amount).toFixed(2)}
                      </p>
                    )}
                  </div>
                  <Link
                    className="underline"
                    to={sourceHref(item.source_table, item.source_id)}
                  >
                    打开来源
                  </Link>
                </div>
                {["collection", "verification", "deferred"].includes(
                  item.kind,
                ) && <CollectionControls orderId={item.source_id} />}
                {item.kind === "production" && (
                  <details>
                    <summary className="cursor-pointer py-2">
                      展开生产子单（{item.child_count} 单）
                    </summary>
                    <div className="space-y-3">
                      {item.children?.map((child) => (
                        <div className="rounded border p-3" key={child.id}>
                          <Link
                            to={sourceHref(
                              "romiku_production_orders",
                              child.id,
                            )}
                            className="underline"
                          >
                            {child.document_number}
                          </Link>
                          <span className="ml-2">
                            {dueLabels[child.classification]}
                          </span>
                          <ProductionDueControls productionId={child.id} />
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                {item.kind === "task" && (
                  <RecordDelete
                    kind="manual_task"
                    id={item.source_id}
                    label={item.title}
                  />
                )}
              </article>
            ))}
          </div>
          {!data.rows.length && <p>当前没有符合条件的待办。</p>}
          <div className="flex gap-3">
            <Button disabled={page === 0} onClick={() => setPage(page - 1)}>
              上一页
            </Button>
            <span>第 {page + 1} 页</span>
            <Button
              disabled={(page + 1) * size >= data.total}
              onClick={() => setPage(page + 1)}
            >
              下一页
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
