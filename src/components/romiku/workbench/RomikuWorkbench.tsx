import { documentStatusLabels } from "../commercialLabels";
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
  ...documentStatusLabels,
  pending_contact: "待联系",
  pending_screening: "待筛选",
  following_up: "跟进中",
  pending_quote: "待报价",
  overdue: "已逾期",
  todo: "待处理",
  done: "已完成",
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
  const [detailed, setDetailed] = useState(false);
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
    setDetailed(true);
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
      <div
        className="grid grid-cols-2 gap-2 lg:grid-cols-4"
        aria-label="业务概览"
      >
        {(["recent", "collection", "arrange", "verification"] as const).map(
          (key) => (
            <button
              type="button"
              key={key}
              onClick={() =>
                key === "verification" ? choose("all", key) : choose(key)
              }
              className="min-w-0 rounded-lg border bg-background px-4 py-3 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="block text-xs text-muted-foreground">
                {key === "verification" ? "客户确认待核实" : tabs[key]}
              </span>{" "}
              <span className="mt-1 block text-2xl font-semibold tabular-nums">
                {key === "verification"
                  ? (data?.unknown_total ?? "—")
                  : (data?.counts[key] ?? "—")}
              </span>
            </button>
          ),
        )}
      </div>
      <div
        className={
          detailed
            ? "min-w-0"
            : "grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]"
        }
      >
        <div className="min-w-0 rounded-lg border bg-background p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">
              {detailed ? tabs[tab] : "近期需要处理"}
            </h2>
            {detailed ? (
              <Button
                variant="ghost"
                onClick={() => {
                  choose("recent");
                  setDetailed(false);
                }}
              >
                返回业务概览
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => choose("all")}>
                查看全部
              </Button>
            )}
          </div>
          {detailed && (
            <>
              <div
                className="mb-3 flex flex-wrap gap-2"
                aria-label="详细待办分类"
              >
                {Object.entries(tabs).map(([key, label]) => (
                  <Button
                    key={key}
                    variant={tab === key ? "default" : "outline"}
                    aria-pressed={tab === key}
                    onClick={() => choose(key as keyof typeof tabs)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
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
                  <select
                    aria-label="筛选状态"
                    className="ml-2 w-32 rounded border p-2"
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      setPage(0);
                    }}
                  >
                    <option value="">全部状态</option>
                    {Object.entries(statuses).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          )}
          {tab === "recent" && (
            <p className="text-sm text-muted-foreground">
              上海业务日期：今天及随后 6 天，另含逾期及明确需跟进事项。每页最多
              8 条。
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
              <div className="divide-y">
                {data.rows.map((item) => (
                  <article
                    className="min-w-0 py-3 first:pt-0 last:pb-0"
                    key={item.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 break-words">
                        <Link
                          className="font-semibold underline"
                          to={sourceHref(item.source_table, item.source_id)}
                        >
                          {item.title}
                        </Link>
                        <p className="text-sm">
                          {kinds[item.kind] || "业务事项"} ·{" "}
                          {statuses[item.status] || "待处理"} ·{" "}
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
        </div>
        {!detailed && (
          <aside aria-label="业务提醒" className="min-w-0 space-y-4">
            <section className="rounded-lg border bg-muted/20 p-4">
              <h2 className="font-semibold">客户确认待核实</h2>
              <p className="mt-2 text-sm">
                {data?.unknown_total ?? "—"} 张订单需要核实
              </p>
              <p className="mt-2 break-words text-sm">
                潜在应收：
                {data?.potential_receivables
                  .map((x) => `${x.currency} ${Number(x.amount).toFixed(2)}`)
                  .join("；") || "—"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                尚未确认应催收；核实前不生成常规催款，不代表已结清。
              </p>
              <Button
                variant="link"
                className="h-auto px-0 py-2"
                onClick={() => choose("all", "verification")}
              >
                查看待核实订单
              </Button>
              <Button
                variant="ghost"
                className="flex h-auto max-w-full whitespace-normal px-0 text-xs"
                onClick={() => choose("all", "deferred")}
              >
                查看客户未确认 / 草稿有余额
              </Button>
            </section>
            <section className="rounded-lg border p-4">
              <h2 className="font-semibold">待安排事项</h2>
              <p className="mt-2 text-sm">
                {data?.counts.arrange ?? "—"} 项待安排
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                确认工厂交期、历史待分类及其他需要安排的事项。统计沿用全部待安排口径。
              </p>
              <Button
                variant="link"
                className="px-0"
                onClick={() => choose("arrange", "production")}
              >
                查看生产交期
              </Button>
              <Button variant="ghost" onClick={() => choose("arrange")}>
                查看待安排
              </Button>
            </section>
          </aside>
        )}
      </div>
    </section>
  );
}
